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
