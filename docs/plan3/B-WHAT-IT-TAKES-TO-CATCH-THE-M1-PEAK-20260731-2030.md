# B — what it takes to catch the M1 peak. Two of the three things are cheap; the third is a ruling only you can give.

**2026-07-31 20:30 · Manager B · answering the 20:32 dispatch. M1 ownership stays D's.**

Short version: **the tooling is nearly free, and the blocker is a definition.** The same run gives RED
or UNPROVEN depending on when you sample, so no amount of instrument work decides M1 until someone says
which one M1 is about.

## 1. The memory peak needs no sampling race at all — the kernel already has it

**[verified]** on the host just now. `/proc/<pid>/status` exposes `VmHWM`, a kernel-maintained
high-water mark of resident set size: the peak the process ever reached, whether or not anyone was
looking:

```
pid=2019726  type=browser    VmRSS=181.8 MB   VmHWM(peak)=181.8 MB
pid=2019861  type=renderer   VmRSS=105.9 MB   VmHWM(peak)=105.9 MB
pid=2019761  type=GPU        VmRSS=137.7 MB   VmHWM(peak)=137.7 MB
```

**[verified]** CDP's `privateMemory` is `null` for every process on this platform, which is exactly why
D's harness reported `rendererPrivate: 0`. `VmHWM` is populated where CDP is not.

So the renderer-footprint half of M1, which D currently cannot produce at all, becomes: enumerate the
browser's child pids via CDP `SystemInfo.getProcessInfo` (which does return pids and types), then read
`VmHWM` from `/proc`. **No polling, no race, and it captures a peak that lasted six seconds just as
faithfully as one that lasted six minutes.**

**Cost: about twenty lines in D's harness. No host resources beyond a normal run.**

## 2. The image-surface peak needs instrumentation before navigation, not after

The 141.57 MB figure came from polling `document.images` after the app reported ready, so it is a
**lower bound** — the true maximum may be earlier and higher. Two changes make it sound:

* install the sampler with `evaluateOnNewDocument` so it runs from before first paint rather than after
  the app settles, and sample at ~100 ms;
* report **max and the time-integral**, not the final value. `collectStableImageSurface` currently
  returns the settled state by construction, which is the defect.

**Cost: a small change to D's collector. No host resources beyond a normal run.**

## 3. The actual blocker, and it is yours: does M1 gate the peak or the settled state?

**[verified]** On one run, one build, one session, applying **D's own `classifyM1`**:

| surface sampled | verdict |
|---|---|
| at app ready — 29 full-resolution images, 141.57 MB decoded | **RED** — full-resolution-images-still-resident |
| six seconds later — 1 full-resolution image, 5.75 MB | **UNPROVEN** — no-journal-image-surface-detected |

**Nothing changed but the moment of observation.** Until it is decided which of those M1 is asking
about, better instruments only produce both answers with more precision.

My read, offered as input and not as a decision: **a 141 MB transient that clears in six seconds is a
real user-visible cost** — it is jank and memory pressure at exactly the moment someone opens a session
— **but it is a different defect from screenshots that stay resident**, which is what TAL-01891 and
M20-J1 are about. If M1's kill condition is "full-size screenshots are no longer held", the settled
state is the right surface and today's answer is that the surface has nothing to classify. If M1 is
"the product no longer decodes 2.5 GB of pixels", the peak is the right surface, and the harness needs
the two changes above.

**They are both worth having. They are not the same gate and I do not think one harness should try to
return one verdict for both.**

## 4. The one thing I would ask you to clear

**An exclusive heavy window on the host**, after C's arm finishes — the 04:00 slot I already proposed
for the release cut would serve for both if the cut runs first. A peak-capture run is one page load
plus a settle, so it is minutes, not the twenty-minute replay arm; **but it must not overlap a soak**,
because the transient being measured is sensitive to host load and C's arm is sensitive to mine.

Nothing else. No new dependencies, no new access, no new accounts.

## 5. What I am not doing, deliberately

I am not rewriting D's harness. The two changes are small, they are in D's code, and the second one
turns on a definition D should be the one to apply once you have ruled. **I have handed D the mechanism
(`VmHWM`), the evidence that the current collector cannot see the peak, and the reason its classifier
cannot currently reach any verdict but UNPROVEN.** If D would rather I make the changes and run them on
the host, say so and I will — the credential is here and that is the only reason this sat with me at
all.

## 6. Still open, and it decides whether the peak is even a defect

**[unverified]** Whether the decay from 141.57 MB to 5.75 MB is M20-J1 working as designed —
thumbnails replacing full-size images — or a virtualised list dropping off-window rows.
`_m20J1RenderWindow()` and a bounded `_m20J1ThumbCache` LRU both exist in `order-manager.js`
**[inferred]**, so either is plausible.

**If it is the fix working, the peak is the pre-fix cost being paid once and M1 is close to green. If it
is virtualisation, the full-size decode is still happening and M20-J1 is not reaching this path at
all.** That is the question I would put ahead of any instrument work, and it is answerable by reading
which code path produces those 29 images — no host time required.
