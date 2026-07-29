# FINDING — The residue is **conditioned on symbol/timeframe diversity, not on panel count**. Identical panels leave ~67 MB behind; four distinct symbol+timeframe panels leave ~367 MB. That points at per-dataset caches keyed by symbol and timeframe, **which a panel-id-keyed purge would not touch** — so the kill order I issued twenty minutes ago would have missed. Amending it now. Also: the fresh single-chart baseline refutes the 1.3 GB confound and retroactively proves the residue is large.

**2026-07-29 01:45. The PO ran the battery. Two of the six tests are now unnecessary because of what the first two showed, and one hypothesis of mine is dead.**

---

## 1. The measurements

| configuration | during replay | after stop + ~3 min | residue over baseline |
|---|---|---|---|
| **single chart, 60×, fresh tab** | 537 MB / CPU 111% | **233 MB** | — (this is the baseline) |
| **4 panels, same pair, same TF, same indicators** | 916 MB / CPU 145% | **300 MB** | **~67 MB** |
| **4 panels, different tickers, different TFs** | 1,032 MB / CPU 141% | **600 MB** | **~367 MB** |

## 2. The confound is dead, and its death makes the residue bigger, not smaller

**I flagged that the PO's earlier single-chart reading of 1.3 GB might simply be what 60× costs. It is not.** **A fresh single chart at 60× costs 537 MB.**

**So that earlier 1.3 GB single-chart figure, taken after a multichart session, was carrying roughly 800 MB of residue.** **The confound I raised in good faith turned out to be the strongest evidence against my own caution.** The Hoarder is real and it is large.

## 3. The discriminator, which is the actual finding

**Same-symbol panels recover almost completely. Distinct-symbol panels retain five times as much.** 67 MB against 367 MB, with panel count, indicator count, speed and duration all held constant. **The only variable is whether the panels share a symbol and timeframe.**

**The mechanical reading is unambiguous.** Four panels on `EURUSD 1m` need **one** dataset — they mirror the host's. Four panels on `EURUSD 1m`, `USDJPY 15m`, `AUDUSD 1H` and a fourth need **four independent datasets**, each separately fetched and held. **The residue scales with the number of distinct datasets, not the number of panels.**

**Therefore the retained memory is per-dataset, and datasets are keyed by symbol and timeframe.**

## 4. Why this invalidates my own kill order

**At 01:25 I ordered A to purge every parent-side structure keyed by panel id.** **A cache keyed by `symbol+timeframe` is not keyed by panel id, so that purge sweeps straight past it.** The order would have shipped, passed its own acceptance, and left the 367 MB exactly where it is.

**This is the second time tonight that acting fast produced an order aimed at the wrong structure** — the first being the retaining-`Map` instruction I withdrew on discovering it was a `WeakMap`. **The PO's directive to shoot on suspicion is right, and this is the cost of it: some shots miss and must be corrected within the hour rather than defended.** The corrective discipline is what makes the speed affordable, not an exception to it.

**Amended kill order for A, replacing the 01:25 text:**

**Purge on two keys, not one.** Panel-id-keyed state as already ordered, **and** dataset caches keyed by symbol/timeframe — with the release condition being that **no remaining panel references that symbol+timeframe pair.** A departing panel whose dataset is still used by a surviving panel must not free it; a departing panel holding the last reference must. **That is reference counting per dataset, and it is the only correct shape** given that identical panels legitimately share.

**Named suspects, from the shell's own script tags:** `viewport-data-manager.js` and `chart-data-pipeline.js` both exist precisely to cache windowed candle data, load before `chart.js`, and are the natural home for a symbol+timeframe keyed store. **Start there.**

**Acceptance under `GATE-01`, and it must use the discriminator the PO found:** with the switch clear, four distinct-symbol panels must recover to within the same margin as four identical panels — **the 367 MB must approach the 67 MB.** With the switch set, it must not. **A test that only exercises identical panels cannot detect this defect and is not acceptable.**

## 5. Tests cancelled, because the PO's data already settled them

**Indicators are exonerated and Test 4 is cancelled.** The identical-panel run carried the same indicators on every panel and left only 67 MB. **If indicators owned the residue, the identical case would have retained heavily too.** Asking for that test now would be exactly the waste the PO warned against.

**Test 1 is complete and was decisive.** Its result is in the table above.

**Still open and still worth running: the cycle test.** Everything measured so far is a single multichart episode. **Whether the residue accumulates across repeated layout changes decides whether this is a bounded cost or an unbounded leak, and nothing in the current data answers it.** **That question outranks naming the retainer**, because A can fix a mechanism it has not named, but nobody can size a leak that has not been bounded.

## 6. One thing not to lose in the good news

**A single chart at 60× draws 111% CPU.** That is one full core plus, for one chart. **Four panels at 141% is a mild increment on that, which means the per-chart replay cost — not multichart — is the dominant CPU term.** **No fix currently in flight targets it.** FIX 1 addresses smoothness under multichart, not the cost of a single chart running flat out. **Recording it here so the canary disclosure is honest about where CPU goes.**
