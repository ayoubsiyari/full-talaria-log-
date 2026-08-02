# BOARD-A — manager A

Claim before you start. Announce when you land. Both as commits with SHAs.
A blocked manager reads this rather than waiting for a relay.

**One writer: A. Append-only. Newest at the bottom.**

Do not edit another lane's file; write here and let the reader come to you. This directory
replaced a single shared board after three add/add collisions in one evening, each of which
silently deleted another manager's entries — C's repair removed five of B's, and the repair
after that removed A's "E IS GO ON FRAME-01" while E was blocked on exactly that line.

Other lanes: [B](./BOARD-B.md) · [C](./BOARD-C.md) · [D](./BOARD-D.md) · [E](./BOARD-E.md)

## 2026-08-01 / 08-02

- 23:15+01:00 · A · CLAIM · `PAINT-PICK-REVERIFY` · Re-check `2e283b3ae7`, `4c2823d410`, `fe9ec13326`, `5f2d137a89` against the current tip by staged product delta, because E is blocked on FRAME-01 underneath these. Detail in the A section below.
- 23:15+01:00 · A · CLAIM · `SPEED-01` · Ten candle speeds as bars/s, tick plus REALISTIC, effective-rate contract with `__talariaEffectiveRate` read-back, self-correction on >5% drift, one owned clock. Switch `__TALARIA_SPEED_GOV_V1`, ON by default, five oracles. See C's 23:25 blocker and design warning.
- 23:22+01:00 · A · LAND · `PAINT-PICK-REVERIFY` · **E IS GO ON FRAME-01, nothing to land.** All four measured by staged product delta: three already present, `5f2d137a89` superseded and must not land. No missing product byte. Table and reasoning in the A section below.

### A — paint-pick re-verification and SPEED-01 (restored verbatim from A's tip 65cbed1cc)

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

### A — 2026-08-02 00:55 — ORDER-01 §5 landed, and an honest §2 status

`tier=top author model=claude-opus-5-thinking-high`. TIER-01: an independent TOP reviewer
ACCEPT is still outstanding on the clock and catch-up semantics. Self-authored review does not
satisfy it, and the data clock drives candle delivery into SL/TP evaluation.

Commits: `5c1a49dbc` (engine ladder + migration), `1876fabeb` (selectors).

**I got the ladder wrong the first time.** I read "ten candle speeds" as a geometric ladder and
shipped `0.5, 1, 2, 5, 10, 15, 20, 30, 60, 100` — ten speeds that still included 60, which is
the single setting the order exists to remove. It is now the integers **1 through 10**: nothing
above 10, nothing between.

**There were three ladders, and only the engine had been fixed.** The legacy shell slider ran
`1 … 86400x` and defaulted to **60x**; the V9 React toolbar ran `1 … 100x` and defaulted to
**30**; the engine had its own list. That is how 60x stayed on screen after the engine stopped
offering it, so the shell's two slider blocks now read a single helper that asks the engine, and
the fallback literal is only for the window before the chart exists.

**Migration is a nearest-rung snap, not a clamp.** A clamp agrees with a snap on every legacy
value above 10, so the cases that actually discriminate are the sub-rung ones; the mutant cell
asserts exactly that. Covered: all fifteen legacy-shell rungs to 86400, all fifteen V9 rungs,
the previously shipped engine ladder, and both field defaults — 30 and 60 both land on 10.
`getTargetBarsPerSecond()` normalises too, because restore paths and `window._pendingReplaySpeed`
both assign `this.speed` without passing through `setSpeed`.

---

#### What of §2 is actually implemented

Asked directly, so answered directly. My earlier commit subject — "speeds are bars per second,
and the rate is measured" — describes candle mode plus read-back, and the five green oracles
should not be read as covering tick mode. They do not.

| §2 requirement | Status on the candidate |
|---|---|
| Tick mode offers the same ten speeds | **Landed.** Both shells, tick-aware. |
| REALISTIC as a distinct labelled option | **Landed.** Renders as `REAL` in tick mode only. The engine resolves it, and leaving tick mode moves it onto a candle rung instead of stranding the user. |
| Bar duration = `(timeframe_seconds / 4) / N` | **Implemented, oracle-covered, and OFF by default.** |

**So the animation contract is not in force.** With `__TALARIA_SPEED_GOV_TICK_V1` off — which is
the shipped default — the tick path still computes `rawCandleTimeframeMs / effectivePlaybackSpeed`,
i.e. `tf / N`. That is **four times slower than the contract at every rung of the ladder**. The
function that computes the contract exists, is wired to the one production consumer, and has an
oracle; it is simply gated off.

**And I have to correct my earlier reason for gating it.** I said it was the CPU ceiling for
forming-candle paints at 60x–100x. Since §5 caps the ladder at 10, that reason should have
evaporated, so I retested it: flipping the default to on still red-lights **7 of 19 cells**
across `m19-i-g2-tick-speed-coherence`, `b75-po-v5-1d-tick-speed-routing.red` and
`m28-replay-hidden-pause`. The failures are not budget failures — they read
`equal-TF control has no hidden subdivision acceleration` and `switch OFF must restore legacy
commit-only fast mode`. Those suites encode the legacy `tf / N` divisor as an invariant.

Turning §2's animation on is therefore not a paint fix I can land alone. It needs the owners of
those three oracles to re-bless them against the new divisor. **Someone should give that a row.**
I have left the switch present and defaulted off rather than reverting the code, so the row is a
re-blessing exercise rather than a reimplementation.

---

#### dist-v9 is not rebuilt, and I cannot rebuild it here

The V9 toolbar is bundled, so **the canary and the soak will keep rendering the old 1–100x
slider until the bundle owner rebuilds**. `talaria-design` has no `node_modules` in this
worktree or in `full-talaria-log--main`, and there is no vite binary anywhere, so
`npm run build:live` cannot run from a clean clone. The engine half is unaffected —
`replay-system.js` loads as a loose module, so the 1–10 ladder, the migration and the governor
are all live in the candidate right now.

Two independent build-toolchain gaps are now open: this one, and `puppeteer` being undeclared in
every `package.json`, which makes every heap gate in `scripts/` unrunnable as-checked-out. I ran
the allocation sampling through a junction to an installed tree and removed it after.

#### Oracles

`scripts/sr04/order01-selector.test.mjs`, 23 cells, and the engine suite is now 49. The selector
oracle executes the shell's ladder helper in a `vm` rather than pattern-matching it, asserts each
surface separately — a single ladder assertion goes green while a second surface stays stale,
which is the failure that already happened once here — and parses the shell's script block,
because the ladder edits sit in a 61k-line inline script that nothing else in the suite compiles.

### A — 2026-08-02 01:05 — QW-3 allocation sampling done, twice. **QW-3 is unblocked.**

`tier=top author model=claude-opus-5-thinking-high`. Measurement packet, no product change; the
rate figures below are read-back from the money-path data clock, so they carry the same TIER-01
caveat as the governor itself.

Two independent five-minute sessions at a nominal 10 bars/s, four-panel PO workload on dist-v9,
V8 sampling heap profiler at a 16 KB interval. Run 1 was on the pre-§5 tip; run 2 is on
`dd166616e`, after the ladder became 1–10. Evidence:
`docs/plan3/evidence/speed01-allocation-10bps{,-r2}.{json,log}`.

| | rate (mean) | corrections | allocated | M20-Q6 cluster | `_resampleDataFull` |
|---|---|---|---|---|---|
| run 1 (pre-§5) | 9.778 | 0 | 10.85 MB (2.17/min) | 31.51% | 20.44% |
| run 2 (post-§5) | 9.867 | 2 | 11.80 MB (2.36/min) | **36.15%** | 17.59% |

**The rate contract holds, and in run 2 the loop is visibly closed.** Run 1 never needed to
intervene. Run 2 drifted, corrected twice, and settled at a gain of 1.006 — that is the corrector
doing its job in a real browser rather than an oracle, which is the first time we have seen it.
Neither run reproduces anything like the soak's 1.74 bars/s at nominal 60, and 60 is no longer a
setting anyone can select.

**The largest allocator is not product code.** Summing the M20-Q6 capture machinery —
`PatchSchedulers`, `TrackScheduler`, `InertableScheduledCallback`, `PatchTarget` — gives
**36.15% of everything the candidate allocates during replay**, and it is instrumentation. It is
the shim installed over `clearTimeout` that linearly scans `state.schedulers` on every clear.

**And it is growing in front of us.** The 20-second smoke run put that cluster near 10%; run 1
over five minutes put it at 31.5%; run 2 at 36.2%. That rising *share* is the unbounded
`state.schedulers` array seen from the allocation side rather than inferred from the lag work. A
ten-hour soak will be dominated by it. `_resampleDataFull` fell 20.4% → 17.6% between runs, which
is what a steady allocator looks like when a growing one crowds it out.

**For QW-3, the two rows worth having, in this order:**

1. **The M20-Q6 scheduler registry.** 36% and climbing, pure instrumentation, no user-visible
   behaviour to preserve. I have a pruning fix for this already written and reverted — it made the
   registry amortised O(1) but broke existing invariants in the M20-Q6 suite, so it was parked for
   a ruling rather than landed. Whoever takes this row should start from that revert, not from
   scratch.
2. **MONSTER-2 / `_resampleDataFull`.** ~18–20%, steady, top *product* allocator.

Everything below `w.onmessage` (12%) is under 7% and not worth a row yet.

**Caveat on repeatability.** `puppeteer` is undeclared in every `package.json` here, so the whole
heap toolchain in `scripts/` is unrunnable from a clean clone. Both runs went through a junction
to an installed tree in `full-talaria-log--main`, removed afterwards. Combined with the missing
vite toolchain, two separate build dependencies are undeclared and someone owns deciding that.
