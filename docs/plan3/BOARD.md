# BOARD

Claim before you start. Announce when you land. Both as commits with SHAs.
A blocked manager reads this rather than waiting for a relay.

Newest entries at the bottom of each section.

---

## Claims

### A — 2026-08-01 23:15 — paint picks re-verification (blocks E on FRAME-01)
Re-checking `2e283b3ae7`, `4c2823d410`, `fe9ec13326`, `5f2d137a89` against the current tip.
My 22:20 finding was that all four are already-present or superseded; re-verifying against
the live tree before E acts on it, because E is blocked on FRAME-01 underneath these.
**E: do not wait on a relay — the ANNOUNCE entry below will say GO or NO-GO with evidence.**

### A — 2026-08-01 23:15 — SPEED-01 entire (ORDER-01)
Ten candle speeds as bars/s, tick mode plus REALISTIC, effective-rate contract with
`__talariaEffectiveRate` read-back, self-correction on >5% drift for >5 s, one owned clock,
latest-state-wins catch-up. Switch `__TALARIA_SPEED_GOV_V1`, ON by default. Five oracles.
Serial chain: the 5-minute allocation sampling session at 10 bars/s runs the moment this
lands, and QW-3 is blocked until that completes.

---

## Announcements

### A — 2026-08-01 23:22 — paint picks: **E IS GO ON FRAME-01, nothing to land**

Re-verified all four against tip `05916678d` by measuring staged product delta, not by
reading branch names. **The content FRAME-01 sits on is already in the build.** E should start
now.

| Row | staged product delta | verdict |
|---|---|---|
| `4c2823d410` | +0 / −0 | already present |
| `fe9ec13326` | +0 / −0 | already present (identical patch-id to the above, `7a028b2e…`) |
| `2e283b3ae7` | +28 / −0, all of it a duplicate | already present and wired |
| `5f2d137a89` | +0 / −0, 2 conflicted product files | **superseded — must not land** |

Not skipped, and nothing here is unfixable — there is simply no missing product byte to land.

- `2e283b3ae7`'s entire +28 is a verbatim second copy of `_lagSetIntervalTickV1Enabled`.
  HEAD already has that definition at line 162 and its call site at 5410; applying the pick
  puts two identical definitions in the file. That is a defect, not a landing.
- `5f2d137a89` is the older **focus-based** FIX 1 against the tip's **visibility-based**
  revision. HEAD has `_isMultichartPanelVisibleForPaint()` where it wants
  `_getFocusedMultichartPanelId()`, and `_requestRafPaint()` where it wants `render()`.
  Since `focusedPanelId` defaults to host tile A and only changes on click, landing it
  re-creates "never-clicked on-screen tiles never paint" and reverts rAF paint coalescing.

**For E's audit:** absent-by-commit is not absent-by-content. Three of these four were present
and the fourth is a superseded ancestor of what is present. Worth re-checking the remaining
roster by staged delta before the next pick round.

Evidence commit: this entry. Tree clean at `05916678d`, no product bytes changed.
### A — 2026-08-02 00:05 — SPEED-01 landed (ORDER-01)

Commits: `bbfe22775` core, `4944f4ea4` oracles, `86bbfa87e` tick switch + climb refactor.
sr04 246/246, cadence-adjacent suites 97/97, both mirrors identical, tree clean.

**For the soak (B):** `window.__talariaEffectiveRate` is live and is a plain number, bars per
second, published on every playback tick and mirrored to `window.top` so a panel-hosted read
works. `window.__talariaSpeedGov` carries `{effective, target, gain, mode, corrections,
playing, at}` if you want the detail behind a reading. Rate-hold can read the number directly.

Two things to know before you trust a reading:
- It is 0 while paused and for the first ~2 s of play. That is the measurement window filling,
  not a stall. Sample only while `__talariaSpeedGov.playing` is true.
- `gain` above 1 means the governor is already compensating for a slow session. A rate-hold
  that looks flat with a rising `gain` is a session degrading underneath a governor that is
  hiding it. **Record `gain` alongside the rate at hour 0 and hour 10** or the verdict can
  read green over a real regression.

**On 1.74 vs 62.4:** the labels were honest and the old cadence was open loop — it derived a
timer interval from the label and never looked at the result. Nothing in the build could have
noticed a 60x session delivering 1.74 bars/s. That is now measured, published, and corrected.

**Territory note for the tick-mode owners (M19-I-g2, M28, B75):** the ORDER-01 tick contract
`(timeframe_seconds / 4) / N` is implemented and proven by oracle O2, but shipped **opt-in**
behind `__TALARIA_SPEED_GOV_TICK_V1`, not ON. It makes every tick bar four times shorter, so
at 100x on 1m the bar is 150 ms and the forming candle repaints twice inside it — **13
paints/sec against the ~4/sec M19-I-g2 measured a loaded chart can afford.** Turning it on
without first decoupling paint cadence from bar cadence reinstates the CPU ceiling at the top
of the ladder. That decoupling is a change to the animation path and belongs to its owners, so
I have not made it unilaterally. **Director: this is the one clause of ORDER-01 I have not
defaulted ON, and it needs a ruling.**

### A — 2026-08-02 00:05 — allocation sampling claimed (blocks QW-3)
5-minute session at 10 bars/s on the candidate. Announcing the result here when it lands.
### A — 2026-08-02 00:35 — allocation sampling done, **QW-3 IS UNBLOCKED**

Commit `2be0d4e9a`. Evidence: `docs/plan3/evidence/speed01-allocation-10bps.json` (+ `.log`).
Five minutes, nominal 10 bars/s, four-panel PO workload on dist-v9, V8 sampling heap profiler
at a 16 KB interval.

**Rate — the contract holds on the candidate.** Mean **9.778 bars/s** against a nominal 10
(min 8.44, max 11.17), gain ended at **1.000** with **zero corrections**. The governor never
had to intervene, which agrees with the PO's hand-measured 10.4 and is the first in-browser
read-back of `__talariaEffectiveRate`. Whatever produced the soak's 1.74 at nominal 60, it is
not the labels, and it is not present in a fresh five-minute session at 10.

**Allocation — 10.85 MB sampled, 2.17 MB/min.** Top of the list:

| Site | MB | % |
|---|---|---|
| `_resampleDataFull` (chart.js) | 2.22 | 20.44 |
| `m20Q6PatchSchedulers` (replay-system.js) | 1.64 | 15.14 |
| `m20Q6TrackScheduler` (replay-system.js) | 1.56 | 14.43 |
| `w.onmessage` (chart-indicators-full.js) | 1.24 | 11.46 |
| `mergeIndicatorTailWindow` (indicator-performance.js) | 0.48 | 4.40 |
| `_isMultichartEmbedPanel` (chart.js) | 0.25 | 2.26 |
| `calculateMACD` | 0.23 | 2.09 |

**The headline is not MONSTER-2.** Summing the M20-Q6 capture machinery — PatchSchedulers
15.14 + TrackScheduler 14.43 + PatchTarget 1.16 — gives **30.7%, the largest single cluster in
the profile, and none of it is product code.** It is the instrumentation shim installed over
`clearTimeout` that linearly scans `state.schedulers` on every clear. Nearly a third of what
the candidate allocates during replay is measurement apparatus.

**And it grows.** The 20-second smoke run measured that same cluster at ~10%; over five minutes
it is 30.7%. That is the unbounded `state.schedulers` array showing up as a rising *share* of
allocation, which is the quadratic cost I reported earlier now visible from the allocation side
rather than inferred. A ten-hour soak will be dominated by it.

`_resampleDataFull` at 20.44% confirms MONSTER-2 as the top *product* allocator, second
overall.

**For QW-3:** start here. The two rows worth having are the M20-Q6 scheduler registry (30.7%,
growing, pure instrumentation, no user-visible behaviour to preserve) and MONSTER-2 (20.4%,
steady). Everything below `w.onmessage` is under 5% and not worth a row yet.

**Caveat for whoever repeats this:** `puppeteer` is not declared in any `package.json` in
this repo, so the whole heap toolchain cannot run here as-checked-out. I ran it through a
junction to the installed tree in `full-talaria-log--main` and removed the junction after.
Someone should decide whether that dependency gets declared, because right now every heap gate
in `scripts/` is unrunnable from a clean clone.
