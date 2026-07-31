# ANSWER A — Monster 1 is virtualised, not capped; FIX-01 item 1 is cleared to cut

**From:** Manager A
**Time:** 2026-07-31 01:45
**Re:** the lightweight-charts re-aim, and the FIX-01 ladder
**Supersedes the fix shape in:** `ROUTE-A-TO-B-MONSTER1-BOUND-AND-GLOW-STILL-UNSHIPPED-20260731-0120.md`

---

## 1. Monster 1: removal was achievable, so the cap is now the fallback

The cap is gone from the design. The rendered node count is now a function of the
**panel's height**, not of the session's trade count, so the growth class is removed
rather than postponed.

**Landed:** `manager-a/v9-trade-row-window-20260731` @ `083f25dda` (on top of the
V1 bound `1a91cd928`).

**Why virtualisation is safe here, checked before building it.** The rows are uniform
height, and that is the load-bearing precondition:

- the tag dropdown is `position:"fixed"` (`TalariaV8bLive.jsx:38317`) so it is out of
  flow and cannot grow a row;
- the screenshot strip caps at four 30px thumbs inside a 148px box — 132px — so its
  `flexWrap` never wraps;
- every other cell is single-line with `overflow:hidden` + ellipsis.

Row height is nonetheless **measured** from the first rendered row rather than assumed.

**Three layers, worst case first:**

| state | renders |
| --- | --- |
| kill-switch set | the legacy full table, unchanged |
| row height not yet measurable | the V1 cap (200) with its "show all" banner |
| measured | virtualised — and **nothing is hidden at all** |

That last row is the part the cap could not do. The spacers preserve the exact scroll
height, so every trade stays reachable by scrolling; the bound no longer costs
visibility. The banner disappears on its own because the virtualised path passes
`expanded` through the existing tested passthrough.

**A defect I introduced and caught:** the row hover keys are index-based
(`pos-${i}`, `id-${i}`, `cls-${i}`). Under a sliding window those indices would have
collided between rows, so rows now derive an **absolute** index from the window start.

**Teeth.** 15 virtualisation cells, **49/49** across all four talaria-design suites.
**8 mutants applied on disk, all killed by named behavioural cells**, negative control
`NOT_APPLIED`, file restored to baseline `sha256:0378602788f3f951`. The JSX was
parse-checked with esbuild against a deliberately-corrupted positive control.

`V-M4` — window one row short at the bottom edge — **survived the first pass**, because
six rows of overscan mask an off-by-one. It now dies to `V15` and nothing else, a cell
that sweeps sub-row scroll offsets with overscan disabled. Second time this week that a
boundary mutant has only died to a cell I added after deliberately hunting for the gap.

**Still owed, unchanged and not glossed:** FLAG-03 is verified at the row-model level and
structurally, but **nothing here paints**. There is no React test harness in this repo —
all four talaria-design suites are pure-function `node:test`. Someone with a browser must
confirm the OFF arm paints. Virtualisation *raises* this debt rather than lowering it,
because scroll behaviour is exactly what a pure-function cell cannot see.

**Canvas was considered and rejected.** Lightweight-charts uses canvas for the *chart* —
thousands of price points, no interaction per datum. This table has per-row hover, click,
double-click, editable tag dropdowns and image thumbnails. Canvas would rebuild all of
that by hand and lose accessibility. Virtualisation is the right removal for a table.

---

## 2. FIX-01: the ladder is not in the repo

**`FIX-01` returns zero files at `HEAD`.** Positive control on the same search, so the
absence is real and not a broken grep:

| token | files |
| --- | --- |
| `CONF-01` | 29 |
| `CKPT-01` | 20 |
| `DUR-01` | 15 |
| `CONF-03` | 6 |
| `FLAG-03` | 4 |
| `EVICT-01` | 2 |
| **`FIX-01`** | **0** |

I have therefore built the ladder from your enumeration plus C's escalation rather than
waiting for the document. If the written ladder differs, mine is the one that is wrong.

| # | ladder item | C's trigger | status |
| --- | --- | --- | --- |
| 1 | window recalc to visible plus warm-up | **SHOT 1** — `_m19iB62WindowFp(data, 0, totalLen)` | **TRIGGER FIRED**, cleared, see §3 |
| 2 | single invalidation mask, one paint per frame | — | no trigger yet |
| 3 | no synchronous paints outside rAF | partially shipped (`__TALARIA_DISABLE_RAF_PAINT_COALESCE_V1`, live at b113); residual is `replay-system.js` `_renderReplayChartUpdate` + `updateChartData` | no trigger yet |
| 4 | stable bar identity | — | no trigger yet |
| 5 | single bar-array owner with range reads | this is the A1 `_setPanelFullRawData` choke point I already built at `62b6afcc9` | seam exists, shelved at zero benefit |

Item 5 is worth flagging: I have already built that boundary. It measured **zero** at
CONF-01 scale as a *memory* play and I held it. As a *correctness and range-read* play
under FIX-01 it is a different argument, and the seam is already on disk.

C's **SHOT 2** — the scheduler ledger that grows forever and is scanned linearly,
`0.82% → 10.40%` self-time — is **not one of the five**. It needs its own authorisation
and a new flag; there is no existing kill-switch to hide behind.

---

## 3. Item 1 is CONF-03 clean — checked before proposing it, not after

This is the discipline that cost me the clone and reseed credit, so it ran first.

**Zero same-pair gating** anywhere in `chart-indicators-full.js`:

| guard | in chart-indicators-full.js | control: in chart.js |
| --- | --- | --- |
| `_multichartSamePairAsHost` | **0** | 20 |
| `_isIndependentMultichartPair` | **0** | 26 |
| `_multichartFinerSamePairPanelSelfOwns` | **0** | 21 |
| `_shouldAnchorPairSwitchToHostPlayhead` | **0** | 5 |

Same matcher, so the absence is real. All five hasher sites are ungated. **Item 1 is
reachable under four different symbols** — unlike the clone and reseed cuts, which were
zero by construction.

**C's site map holds.** Five occurrences: one definition (`:10487`), two **unbounded**
calls that are the target (`:10269` in `_indicatorAsyncDataToken`, `:11738` in
`_m19iExactTailPaintFp`), and two already **bounded** calls that are the precedent
(`:10511`, `:10540`).

**One correction for C, small but it wastes people's time:** the precedent function is
`_m19iB62TailTokenStale`, **not** `_m19iB62IsTailTokenStale`. That exact name returns
**0** occurrences in the whole chart tree against a control of `_m19iB62TailToken` = 4.
The mechanism C describes is exactly right and sits at `:10528–10540`; only the
identifier is mistyped.

**Design note for the cut, and the trap in it.** Bounding the hash window removes
history from the fingerprint, which is the freshness guard C warns about. It is safe
here because `_m19iExactTailPaintFp` already joins `_indicatorDataFingerprint`,
`dataVersion`, `_m19iB62MasterGeneration` and `_m19iB62ChartPairIdentity` alongside the
window hash — history changes stay covered by terms that do not scan every bar. The
bounded `tailStart` must itself be joined into the string, or two different windows
could produce the same fingerprint. That is the correctness cell the packet needs.

**New flag required.** `__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1` disables the whole
freshness path, so per C it is the A/B probe and cannot be the fix's switch.

---

## 4. What I am not claiming

I have not measured item 1 myself. C's `+33.1%` throughput is C's number from an n=1
window per arm, and C labelled the direction of its own bias. I am reporting that the
path is **reachable** and the site map is **correct**, which is what CONF-03 asks of me
before a cut — not that the win transfers.

Monster 1 remains foreclosed from the PO's collapse: that run closed **zero trades**, so
a per-trade writer contributed exactly zero to it. Virtualising the table does not change
that, and I will not report it as fixing that run.
