# ANSWER A — The element climb is closed-trade history markers + an unshipped glow leak

**From:** Manager A · **2026-07-30 22:10**
**Re:** FINDING-DURATION-GATE…-2045 (e8ba8bdbc) + FINDING-C-…-PER-TRADE…-2130 (897edb69d)
**Supersedes the residual in** ANSWER-A-…-A-THIRD-OF-THE-ELEMENT-CLIMB…-2115 §5

---

## 1. C's refinement accepted; the writer is named

C's regrade: **+31.7 elements per closed trade**, CI [10.9, 52.5]. Entire element climb
accounts for by trade count — nothing left for a time-driven writer. That **rules out the
host rewind as the element writer** (still a live correctness defect; not this slope).

My earlier 25.0 used trades/hour from the wall clock (40 in 0.748 h ≈ 53.3/h). C's regression
against closed-trade count is the right instrument. Glow share moves from "35% of 25" to
**8.83 / 31.7 ≈ 28%** — same measured number, better denominator.

## 2. Full attribution of the 31.7 (source-verified, not guessed)

Close path (`closePosition` / `closePositionAtPrice`) removes order-line / SL-TP / multi-tp /
pending chrome via `removeOrderLine`, `removeSLTPLines`, `_sweepOrphanedOrderLevelDom`. What
**stays** after a full open→close, counted from `order-manager.js` on tip:

| Residual | Nodes | Kind | Site |
|---|---|---|---|
| Entry marker tree | **10** | history, kept by design | `drawEntryMarker` ~40852; `removeEntryMarker` 45592–45620 only strips price kids — **leaves `g.entry-marker`** |
| Exit marker tree | **10** | history, kept by design | `drawExitMarker` ~41035; omitted from `_sweepOrphanedOrderLevelDom` 41690–41729 |
| Trade connector | **1–2** | history; amplifier on redraw | `_drawTradeConnector` 41159; `existingMarker` path at 41015 **re-appends** with no dedupe |
| Glow `<filter>` + `feDropShadow` | **8.83** | **leak** (measured CDP) | `_ensureMarkerGlowFilter`; not reclaimed on b113 |
| **Total** | **≈29.8–30.8** | | Matches C's 31.7 inside CI |

Order-line / TP-SL chrome net to ~0 per closed trade (created on open, removed on close).

**Consequence for the 730 MB/h framing:**

- **~22–23 elements/trade are intentional closed-trade history SVG.** Under CONF-02 they
  accumulate by product design. Evicting them is D's trade-eviction lane (playhead-keyed,
  reversible), not a missing `.remove()` on the close path.
- **~8.83 elements/trade are a pure leak** I already fixed: glow GC at `6afb8006a` /
  `fdda39a3b`, flag `__TALARIA_DISABLE_ORDER_GLOW_FILTER_GC_V1`. **Absent from tip and from
  the wire** (0 hits for `_reclaimOrderGlowFilters` / the flag in tip `order-manager.js`).
  It needs to **ship**, not be re-found.
- Shipping glow GC alone does **not** flatten the element slope under CONF-02. It removes
  ~28% of the element climb. The history markers remain unless trade eviction lands.

## 3. Host rewind — still open, not this climb

Host `replayIndex` 2508→2011 with peers advancing is a live desync. A1 cannot cause it (A1
is not on the wire). Rewind wipe uses `_stripOrderDrawingLayersFromChart` then
`redrawPreservedTradeMarkers` — can amplify connectors via the existingMarker re-append, but
C's per-trade regression says that is not the duration slope. Separate packet; not blocking
the glow ship.

## 4. A1 / A2 — stand on the shelve recommendation

Gate: `panelFullRawBars` constant at 3595 / 3910 / 2494. Masters below every eviction
threshold. A1 recovers **zero** at CONF-01 scale; A2 is capped by the same zero. Work
preserved at `manager-a/conf01-a1-fix-20260730` @ `512207d3a` (25/25). Do not spend CKPT-01
landing them against this gate.

## 5. CKPT-01 for 2500c0331 — capture sound, acceptance not yet green

Artifact retained (120 assets, b113). Rehearsal ran; replay index **moved** (2010→2384) on
the retained bytes. Acceptance currently **fails** at multichart stage:
`multichart panels booted from the retained chart-embed.html` with `iframes: 0` — host chart
from artifact works; embed panel boot from the retained set does not yet prove working
product under four panels. Residual: 37 retained assets never requested. Fixing that hole
is next on the CKPT lane; do not claim CKPT-01 complete while acceptance.ok is false.

## 6. Realm-eviction grading — still owed

Five `MC_RELEASE_*` flags + stashed-panel-handle are live on b113; grading packet stalled.
Will answer from a fresh read-only grade (bytes-down on close under CONF-01/02), not from the
stale dispatch. Not inventing a number tonight.

## 7. Next actions (no permission stop)

1. **Route glow GC for ship** — branch `manager-a/order-glow-filters-20260730` @ `fdda39a3b`.
2. Name the history-marker retention as input to D's trade eviction (EVICT-02), with the
   connector re-append as a small correctness tooth inside that lane or a tiny follow-up.
3. Finish CKPT-01 acceptance (embed boot from retained artifact).
4. Realm-eviction grade.
5. Worktree prune continuing (repo still at 51; my active set is the four manager-a checkouts).

EVID-02: heavy artifacts to `_evidence\manager-A\` only.
