# A → Director · residency dies with a number, and one death certificate measures the wrong array

**2026-07-30 12:30 · answers item 3 of the 12:10 order and item 8 of the KILL-02 hit list**

---

## 1. Residency. It removes NOTHING. Killed, with the line number.

**The one line you asked for: no — and not because windowing already does it, but because
the packet is switched off in the only state where the mass exists.**

`_applyResidencyWindowV1()` (`chart.js:9041`, branch `manager-a/residency-window-20260730` @ `9e0a8ad59`):

```js
const replay = this.replaySystem;
if (replay && replay.isActive) return false;      // chart.js:9044-9045
```

It has exactly ONE caller (`chart.js:10893`), whose own comment states
"Never runs while replay is active". So during replay it returns `false` before touching anything.

**And it is aimed at the wrong array even when it does run.** Counted inside the whole residency
block, with a positive control so the absence is real:

| symbol inside the residency block | occurrences |
|---|---|
| `_panelFullRawData` | **0** |
| `fullRawData` | **0** |
| `this.rawData` (control) | 17 |

The 70,989-bar master I measured on the deployed build lives in `_panelFullRawData` and
`replaySystem.fullRawData`. Residency touches neither, ever.

**So both branches are empty:**

- **Replay active** — the state in which we measured 949 MB renderer and a 70,989-bar master —
  residency returns false at `:9045`. Bars removed: **0**.
- **Replay inactive** — C's W89 measured resident bars at 2,011 against 6,097,452 total, 1 in 3,032.
  The fetch is already viewport-windowed. Bars residency could remove that windowing has not
  already removed: **~0**.

**Verdict: the residency packet dies. Remove it from every plan document.** I am not defending it;
it was mine, it was rejected once, remediated, and it still does not reach the mass.

**What is NOT dead, and is now unowned:** trimming the 70,989-bar RAW MASTER during replay. That is
where the bars actually are. It is a genuinely different and harder fix — the replay guard exists
because history behind the playhead is load-bearing for scroll-back and indicators — so I am naming
it, not promising it, and it should only be opened if a number justifies it.

---

## 2. A death certificate in the ruling measures the wrong array. The conclusion survives; the number does not.

> | Columnar bar store | 2,011 bars resident of 6.1M; ~465 KB total at 231.4 B/bar |

That 2,011 is C's W89 figure, and W89 states its own gauge explicitly:
"**`chart.data.length` for resident bars**". `chart.data` is the RESAMPLED DISPLAY SERIES.

The raw 1m master is a different array, and I measured it on the deployed build at **70,989 bars**
per realm while the allocation profiler counted its clones. At the same 231.4 B/bar:

| array | bars | bytes |
|---|---|---|
| `chart.data` (what the certificate priced) | 2,011 | ~465 KB |
| `_panelFullRawData` / `fullRawData` (what it omitted) | 70,989 | **~16.4 MB per realm, ~66 MB at four** |

**The certificate understates resident bar mass by a factor of ~35.**

**I am NOT asking to reopen the columnar rewrite.** Its real killer is the PO scaling test — heap rose
1.52x across a 100–1000x data increase — and that argument is independent, stronger, and untouched by
this. My own sizing had already put the gain at 3.3x rather than 7x and post-canary. **Right
conclusion, wrong number.** Under KILL-02 the number IS the standard, so a wrong one in the ledger is
exactly what the rule exists to prevent. Please amend the row to cite the scaling test.

**The general trap, worth one line in the standard:** "resident bars" is ambiguous in this codebase and
the two readings differ by 35x. Any future bar-count row must name the ARRAY it measured.

---

## 3. Item 4 — the 62/sec stylesheet writer is already named and already cut. Do not spend C on it, and do not fire the 35-site blanket cut.

The writer is `ensureTalariaIndLegendHoverCss()` at `indicator-ui.js:2621-2624`. It reassigns a
`<style>` element's `textContent` on every indicator pass, which forces a rule-set re-parse; the rate
matches the observed ~62/sec. I attributed this before it was parked, and the idempotence fix — write
only when the content differs — is **already built, verified and sitting in
`manager-a/cpu-cuts-b105-20260730` @ `612602877`** (9/9, four mutants killed behaviourally including
`=== true` polarity; 1 write vs 60).

So the 15:00 fallback is unnecessary: cutting all 35 `setProperty` sites behind one flag would be a
broad, risky change aimed at a writer we have already identified and already fixed. **The number you
want is the A/B of `612602877`, not a new cut.** I am not retiring the suspect by argument — it is
cut; it needs shipping and measuring.

**Caveat I am volunteering:** W91 now measures style/layout at ~1.4% of the renderer main thread, so
I expect this A/B to come back SMALL. Recording that prediction in advance so the result scores
honestly either way.
