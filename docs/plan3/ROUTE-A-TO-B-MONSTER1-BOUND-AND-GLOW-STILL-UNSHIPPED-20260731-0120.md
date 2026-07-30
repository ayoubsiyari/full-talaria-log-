# ROUTE A → B — Monster 1 is bounded; the glow GC never shipped and its second half is not mine

**From:** Manager A
**Time:** 2026-07-31 01:20
**Queue items:** overnight 1 (Monster 1) and 2 (d3 glow pairs)
**Binding:** CONF-03 — no same-pair harness is cited as evidence anywhere below.

---

## 1. Monster 1 — landed

**Branch:** `manager-a/v9-trade-row-window-20260731` @ `1a91cd928`
**Base:** `5763ace5f`. Three files, +63/−2 product lines plus the suite.

The bottom trade table rendered one row per trade with no trim and no
virtualisation. Collapsing the drawer released nothing, because the panel stays
mounted at `height:0` with `overflow:hidden` (`TalariaV8bLive.jsx:37948`).

**The fix is a bound, not a cleanup, and it is a single choke point.** Between the
sort and the map:

```38200:38202:chart v 1.4/talaria-design/src/TalariaV8bLive.jsx
// V9-TRADE-ROW-WINDOW-V1: cap RENDERED rows. Storage, sorting, tab counts and
// CSV export all still run off the unbounded list; only the DOM is bounded.
const rowWindow=boundTradePanelRows(displayRows,{expanded:tradeRowsExpanded});
```

`displayRows` had exactly two occurrences in the file — its definition and the
`.map()` — so the bound is genuinely contained rather than one of several
render paths.

**Window = the tail**, because the table's default sort is id ascending
(`tblSort ? … : "asc"`), which puts the most recent trades last. This also
matches the cap that already exists for this data: `MultichartGrid` bounds peer
trade sync at `slice(-50)` / `slice(-100)`. The host render path simply had no
equivalent.

**Hidden rows stay reachable.** A single banner row — one element regardless of
how many are hidden — expands to the full list. The bound therefore costs
visibility, never data, and CSV export was already running off the unbounded
list so full history was never at risk.

### Kill-switch

`__TALARIA_DISABLE_V9_TRADE_ROW_WINDOW_V1`, truthy-disabling, read per call.

- **FLAG-01** — read per call, never captured. Cell C06 flips it mid-run in both
  directions.
- **FLAG-02** — truthy semantics. Cell C04 drives `[1,'yes','true',{},[],'0',-1,Infinity]`;
  C05 pins that falsy values leave the bound ON.
- **FLAG-03** — and this is the one that bites, because V9 is the visual path and
  PURGE-2 turned three panels black behind an OFF state that satisfied "the
  feature is inactive". Two cells, and I want the second one read carefully:
  - C07 is the working-product assertion: with the flag set, forty closed trades
    still produce forty rows, each carrying **its id and its P&L text**, built
    through the real `buildLiveTradeRowsFromOrderManager`, not synthetic objects.
  - C16 is the structural proof: in the OFF arm the function returns the input
    array **by identity**, so `.map()` walks the very same object the legacy code
    walked. That is the strongest OFF-state guarantee obtainable without paint.

**Stated limit on FLAG-03, unprompted:** neither cell paints. I could not run a
browser (RAM, and C's run), and there is no React test harness in this repo —
the three existing `talaria-design/src` suites are all plain `node:test` over
pure functions. C07 verifies the OFF arm at the row-model level and C16 proves
the renderer receives an identical array. **That is not the same as seeing pixels.**
Someone with a browser should confirm the OFF arm paints before this is called
FLAG-03 complete.

### Evidence

- 16 cells green; 34/34 across all four `talaria-design/src` suites.
- 8 mutants **applied on disk** and all killed, each by a **named behavioural
  cell** — head-instead-of-tail, `=== true` polarity, dropped limit guard,
  boundary off-by-one, ignored expand, faked total, non-array pass-through,
  zeroed hidden count. Negative control reported `NOT_APPLIED`; file restored to
  baseline bytes.
- M4 (boundary off-by-one) dies to **C15 and nothing else** — a cell I added only
  because I inspected the suite for gaps before running mutants. Without it that
  mutant was a survivor.
- JSX validated with the repo's own esbuild, carrying a control: a deliberately
  broken fragment must be rejected, and was.

### Two bounds I am putting on my own fix

1. **This does not fix the PO's run and I will not report it as doing so.** The PO
   ran fifteen minutes at 60x with **zero trades** and hit progressive collapse.
   A per-trade writer contributed exactly zero to that.
2. **Expect the duration gate to stay RED.** +735.0 MB/h over +1333.5 elements/h
   is 564 KB per element; the most favourable corner of both CIs still needs
   51.9 KB, and a DOM element costs single-digit KB. Elements are 0.71–2.78% of
   the slope. This removes a real unbounded structure. It does not remove the
   monster.

**Ownership:** `talaria-v9-live.js` is build output of `talaria-design/src`
(`vite.config.live.js:142`, `emptyOutDir`). I have edited the **source**, which is
the only edit that survives a build, but B owns the build and deploy step.

---

## 2. The glow pairs — the fix exists, was routed, and is still not on the wire

**It never shipped.** On deployed `order-manager.js` at build **20260730b115**:

| identifier | on the wire |
|---|---|
| `__TALARIA_DISABLE_ORDER_GLOW_FILTER_GC_V1` | 0 |
| `_orderGlowFilterGcEnabled` | 0 |
| `_reclaimOrderGlowFilters` | 0 |
| `_reclaimUnreferencedGlowFilters` | 0 |
| `ORDER-GLOW-GC-V1` | 0 |

Positive control on the same fetch, so the absence is real and not my grep
failing for the fourth time today: `_ensureMarkerGlowFilter` = 8,
`_disposeEntryMarkerRecord` = 6, `_sweepOrphanedOrderLevelDom` = 4, `B-W16` = 5,
and 88 `__TALARIA_DISABLE_` occurrences in the same file.

So the 4 → 146 climb was measured on the **unfixed** path. Nothing needs
rebuilding. `manager-a/order-glow-filters-20260730` @ `fdda39a3b` is ready, I
re-ran it tonight at **16/16**, and it still ships from its own base for the
reason recorded at `046db737e`: the current tip is behind deployment on
ORDER-SEL-01 and a transplant would revert a fix that is live.

### CONF-03: the glow reclaim CLEARS

This is the check that killed my own clone and reseed credit, so I ran it against
my own packet before re-routing it.

**Zero same-pair gating.** All four reclaim call sites (`order-manager.js:2235`,
`41612`, `41620`, `42678`) have no same-pair guard within 60 lines above, and the
whole file contains none:

| guard | order-manager.js | chart.js (control) |
|---|---|---|
| `_multichartSamePairAsHost` | 0 | 20 |
| `_isIndependentMultichartPair` | 0 | 26 |
| `_multichartFinerSamePairPanelSelfOwns` | 0 | 21 |
| `_shouldAnchorPairSwitchToHostPlayhead` | 0 | 5 |
| `samePairAsHost` | 0 | 12 |

The control proves the matcher is not blind, and a second control proves the file
was actually read (`_ensureMarkerGlowFilter` 8, `orderId` 464, `this.chart` 366).
**The reclaim is reachable at four different symbols.**

**One label, applied honestly:** the original 530-filters-to-0 figure came from a
separate single-config CDP order-cycle run. I am **not** citing it as CONF-01
acceptance. The case for shipping rests on the reachability trace above plus the
suite, and the magnitude figure travels labelled as single-config.

### The part that must travel with it: the fix does NOT explain the defs half

The reported shape is an **SVGDefs/SVGFilter pair** climbing 4 → 146, ~2.0 per
trade each, always equal. The filter half is mine. **The defs half cannot be.**

From source, with controls:

- There is exactly **one** `append('defs')` site in `order-manager.js`, at
  `:41506`, and it is guarded on the same line:
  `svg.select('defs').empty() ? svg.append('defs') : svg.select('defs')`.
  One `<defs>` per svg, reused. It cannot make a second one.
- `order-manager.js` creates **no svg elements at all** — `append('svg')` 0,
  `createElementNS` 0 — against controls in the same file of `append('g')` 26,
  `append('rect')` 47, `append('filter')` 1. So it never brings a new `<defs>`
  into existence beyond the first per svg it is handed.
- Repo-wide there are only **6** `append('defs')` sites across 73 module files
  plus `chart.js`, control `append('g')` = 84 across the same files.

An always-equal defs/filter pair is not what two independent writers produce. It
is what **one retained subtree counted twice** produces — a detached `<defs>`
holding a single `<filter>`. That reading also fits my open row: our element
census is `querySelectorAll('*')` and sees attached nodes only, so a
detached-but-retained pair is invisible to it and would have to be arriving from
a different instrument.

**Ask to C, cheap and blocking on the claim rather than the ship:** what exactly
does the SVGDefs counter count — attached nodes by selector, or retained nodes
from a heap snapshot? If retained, the pair is one leak counted twice and the
glow GC addresses the creation side while saying nothing about the retention.
**Nobody should report the glow fix as closing 4 → 146 until that is answered.**
Ship it on its own merits; it removes a real unbounded `<filter>` accumulation.

---

## 3. Item 3 status

The 13 owner-blocked ledger rows are in triage, TAL-01891 and TAL-01850 first.
Reporting separately.

## 4. New rows raised tonight

| Row | Detail |
|---|---|
| Duplicated tab filter | `TalariaV8bLive.jsx:37968` inlines a copy of `filterTradePanelRowsByTab`, which exists as an exported helper and is used by the CSV path. Two copies of one predicate, already able to drift |
| No React test harness | The V9 layer has no way to assert on rendered output; three suites exist and all are pure-function. Every FLAG-03 on a visual V9 fix will hit this same wall |
| Glow defs half unattributed | Above. Needs C's counter definition before anyone sizes it |
