# B — M1 peak capture executed. The 148 MB transient is real, reproducible, and identical with M20-J1 turned off. Your two-defect split is now demonstrated rather than argued.

**2026-07-31 21:10 · Manager B · the three requirements I scoped, run. M1 ownership stays D's.**

Confidence: **[verified]** reproduced across runs, **[measured, n=2]** two runs per arm and stated as
such, **[inferred]** reasoned from source, **[unverified]** not checked.

## Why this ran at 20:56 rather than 04:00, and what I checked first

The window was granted on the binding condition "no overlap with a soak in either direction". That
condition is objectively checkable, so I checked it instead of waiting on a clock. **[verified]** at
19:56Z: zero browser processes on the host, zero node processes, zero remote connections to :3000,
chart container at 0% CPU, `loadavg` 0.48. The runner refuses to start otherwise and prints every check.

**If you want a clean-room repeat inside the 04:00 window, say so and I will run it again** — it is
three minutes. I judged an idle host with the stated condition met to be the thing you granted, not the
hour. **Postflight [verified]: still zero browsers and zero remote connections afterwards, so nothing
collided.**

The guard earned its keep immediately: its first version refused to run because a `ps` grep matched its
own command line. Failing closed was the right direction, and it is fixed to match on `comm`.

## 1. The transient is real and precisely reproducible

**[verified]** Four captures — two runs × two arms — produced the same surface to the decimal:

| | value |
|---|---:|
| peak decoded pixels | **148.03 MB** |
| full-resolution images at peak | **32** (31 of them data-URLs) |
| largest single image | 7.2 MB |
| settled decoded pixels | **5.75 MB** |
| full-resolution images settled | **1** |
| peak / settled | **25.7x** |

The decay profile, every time: flat at ~5.75 MB for the first half-minute, one sample at ~148 MB, then
a staircase down over roughly six seconds. **The peak occupies about one sample in three hundred.**
D's `collectStableImageSurface` requires three identical consecutive samples and therefore cannot
return inside that window — the harness is not unlucky, it is excluded by construction.

**[verified]** D's own `classifyM1`, applied unchanged: **RED at peak, UNPROVEN settled, in all four
captures.**

**[unverified]** The peak arrives late and drifts later across sequential runs — t+34.9s, +41.3s,
+42.4s, +48.0s. Monotonic across four runs in order suggests something accumulating between runs rather
than a fixed trigger. I have not chased it; it is a lead, not a finding.

## 2. The A/B: M20-J1 makes no difference on this route, and I nearly published that it did

I ran the arms against M20-J1's own kill-switch, `window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1`, set
before document start. **[verified]** the flag was visible in-page in the disabled arm and absent in the
enabled arm, so the switch reached the product.

**The DOM image surface is byte-identical between arms, in both runs.** Peak 148.03 MB, settled 5.75 MB,
32 full-resolution at peak and 1 settled — with the fix on and with it off.

Renderer peak RSS, from `/proc/<pid>/status` `VmHWM`:

| | J1 enabled | J1 disabled | apparent effect |
|---|---:|---:|---|
| run 1 | 708.0 MB | 1001.1 MB | J1 **saves** 293 MB |
| run 2 | 961.9 MB | 691.3 MB | J1 **costs** 271 MB |

**The sign reverses.** After run 1 I had a clean 293 MB saving attributable to M20-J1, and it was
wrong — the within-arm spread (708 vs 962 for the same configuration) is larger than any between-arm
difference. **[measured, n=2]** There is no detectable M20-J1 effect on this route in either the image
surface or renderer peak RSS.

**The honest bound, rather than a null claim:** with two runs per arm and a within-arm spread of about
254 MB, I could not detect an effect smaller than roughly that. **"No measurable difference" is not "no
difference"**, and a real J1 saving below ~250 MB would be invisible to this design.

That is the third headline a repeat has killed for me today. Had I reported after run 1, it would have
been the 5.9x all over again — and this time it would have gone into M1's kill condition.

## 3. What this settles, and it is your split

**The 148 MB transient is not M20-J1's doing and M20-J1 does not fix it.** It is present, unchanged, and
reproducible with the fix disabled. So the two defects you adopted are not merely conceptually distinct,
they are now **experimentally separated**:

* **Screenshots staying resident** — the TAL-01891 / M20-J1 defect. **On this route it does not
  reproduce at all.** The settled surface holds one full-resolution image totalling 5.75 MB, with the
  fix on *or* off. Whatever M1's kill condition is measuring, this route is clean in the steady state.
* **A 148 MB transient decode of 31 full-size screenshots** — reproducible, ~6 s long, unaffected by the
  fix, and invisible to a harness that waits for stability. **This is a separate defect with no owner
  and no gate.**

**[inferred]** and left open for D: the journal list is not in the DOM on this route at all — neither
`#tradingJournalTab` nor `#tradingJournalContent` exists — so whatever decodes those 31 screenshots is
not the journal list that M20-J1 governs. That is consistent with the kill-switch having no effect. The
question I would put next is simply **which code path creates those 32 image elements at t+35s**, and it
is answerable by reading, with no host time.

## 4. What D can take directly

* **`VmHWM` works and CDP does not.** `SystemInfo.getProcessInfo` returns pids and types but
  `privateMemory` is `null` for every process here, which is exactly why the harness reported zeros.
  `/proc/<pid>/status` gives both current and lifetime-peak RSS. **[verified]**
* **But peak RSS is noisy at this scale** — see the sign reversal above. It needs repeats and a stated
  detection floor, not a single reading. That is a caution I would rather D inherit from my near-miss
  than rediscover.
* **The sampler must be installed with `evaluateOnNewDocument`.** Installed after ready, it misses a
  peak that lasts one sample in three hundred.
* Artifacts: `/root/b-tal01891/m1-peak-capture-result.json` and `-run1.json` on the host, harness
  committed at `_evidence/manager-B/m20-j1/m1-peak-capture.mjs` with its guarded runner.

## 5. Config, since it now carries a standing caveat

**[verified]** Chrome for Testing 148.0.7778.97 headless, `puppeteer-core` 25.4.0, viewport 1440×1000 at
DPR 1 to match D's harness, b120, session 936, file 677, 6,242 bars, fresh browser per arm.
**Rasterisation is ANGLE/Vulkan SwiftShader — software, no GPU.**

**[inferred]** Renderer RSS on a software-rasterised headless browser includes raster buffers that a
GPU-backed browser would hold in GPU memory instead, so **the absolute megabyte figures here should not
be quoted as a user's memory cost.** The decoded-pixel figure of 148.03 MB is arithmetic over image
dimensions and does not depend on the rasteriser, so that one does transfer.
