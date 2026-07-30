# CORRECTION A — the per-trade reading is back, C was right, and the writer is named

**From:** Manager A
**Time:** 2026-07-31 00:05
**Supersedes in part:** `ANSWER-A-ELEMENTS-ARE-1-PERCENT-OF-THE-SLOPE-AND-PER-TRADE-IS-CONFOUNDED-20260730-2315.md` (commit `e4544ba1b`)
**Status:** correcting myself against C, promptly, because C is designing a re-run on my dispute

---

## 1. The correction, first

At 23:15 I disputed C's "+28.7 elements per closed trade" as confounded, using C's own
interval data: a 4x swing in trades closed moved the React writer 89 → 86, correlation
**−0.9042**, while a genuine per-trade d3 writer on the same intervals scaled +0.6678.

I attached a bound to that result in the same document:

> does NOT prove time-driven — **a lagged per-trade writer would decorrelate too**

**That caveat is now the live explanation, and it was found from source.** The per-trade
reading is the better one. C's headline stands and my dispute does not.

---

## 2. What was found, and the reconciliation that settles it

The bottom trades table renders **one row per closed trade**. From source:

```38241:38241:chart v 1.4/talaria-design/src/TalariaV8bLive.jsx
<div key={r.id}
```

- The row region spans 188 lines with **50 host tag sites** (28 `<div>`, 19 `<span>`,
  1 `<svg>`, 1 `<path>`, 1 `<img>`); ~28–31 of them render for a closed row with
  dropdowns shut. **Verified by me textually**, method limit stated: a static count
  sees tag sites, not runtime instances, so this corroborates the magnitude and does
  not measure it.
- The list is **unbounded and not virtualised**.
- The panel is **still mounted when collapsed** — `height: btmOpen ? btmHeight : 0`
  with `overflow:"hidden"` at line 37948. Closing the drawer does not release the rows.

**The reconciliation I could not produce at 23:15.** I read "87 elements per interval,
flat across trade bins" as evidence against per-trade. It is the opposite:

> trades closed at **~3/min, steady** × **~29 elements/row** = **87 per interval**

The constant I treated as the anomaly *is* the per-trade product. The trade rate was
genuinely stable; the response was smooth because the underlying process was smooth.

**Why the correlation went negative.** The rows do not appear at the instant the counter
increments. Re-render is driven by a poll:

```12577:12577:chart v 1.4/talaria-design/src/TalariaV8bLive.jsx
const id = setInterval(bump, 800);
```

plus a `bump` on the `order:closed` bus event (12573–12574). A row therefore lands up to
800 ms after the close that incremented C's counter, so a close near an interval boundary
is counted in one sample and rendered in the next. The d3 defs/filter control **is**
synchronous with the close, which is exactly why it stayed positively correlated while
the React writer did not. Two writers, same predictor, one lagged — that is the negative
correlation, and it is an artifact of my differencing, not a property of the product.

---

## 3. Two hypotheses refuted, including my own

**The Director's stated failure mode — React reconciling and re-mounting rather than
updating, leaving previous nodes attached — is not what the element climb is.** The trade
table key is `r.id`, stable; the rows update, they do not remount. The climb is a plainly
unbounded list with *correct* keys.

The remount pattern does exist, but elsewhere and it is not the climb:

```38931:38931:chart v 1.4/talaria-design/src/TalariaV8bLive.jsx
<div key={`${item.id}-s${layersSelectionRevision}`}
```

Every `drawingSelectionChanged` bumps `layersSelectionRevision` and remounts every visible
Objects Tree row. That is real and worth a row — but a remount **destroys and recreates**,
so an attached-element census reads it as flat. Same for the nav-badge tooltip, which
`createElement("strong")`s ~3.3/sec during replay but calls `replaceChildren()` first:
~7,200 created per hour, none accumulated. **Both are CPU/GC churn, not attached growth.**

**My own leading hypothesis is dead too.** I expected a ref or Map keyed by trade/panel id
storing DOM nodes with no delete. The one id-keyed DOM map, `cellRefs` in
`MultichartGrid.jsx`, **does delete** on unmount (8556–8559), with matching per-panel-id
cleanup at 2843–2872. Positive control: `MutationObserver`/`IntersectionObserver` return 0
against 166 `useEffect` in the same file, so the absences are real and not a broken search.

---

## 4. What this does NOT change

Both of these survive the correction intact, and the second is strengthened by it:

1. **Elements are 1–3% of the renderer slope.** +735.0 MB/h over +1333.5 elements/h is
   564 KB per element; the most favourable corner of both CIs still needs 51.9 KB. That is
   arithmetic and is independent of what drives the elements. **Expect the gate to stay RED
   after any element fix.**
2. **This is not the PO's run.** 15 min at 60x with **zero trades** hit progressive
   collapse. If the element writer is per-trade — which is now the better-supported
   reading — then it contributed **exactly zero** to that run. The correction makes the
   foreclosure firmer, not weaker. **Binding on me: I will not report this fix as fixing
   the PO's collapse.**

The zero-trade segment I asked C for is still worth running. It is no longer a
discriminator between two live hypotheses; it is now a cheap confirmation, and it costs C
one segment of a run already in flight.

---

## 5. The fix, and why it is low-risk

The cap already exists in this codebase for this same data — `MultichartGrid.jsx` bounds
peer trade sync at `slice(-50)` / `slice(-100)`. The host render path simply has no
equivalent. The fix is to bound the rendered window, not to change what is stored.

**Kill-switch:** `__TALARIA_DISABLE_V9_TRADE_ROW_WINDOW_V1`, truthy-disabling
(`[1,'yes','true',{},[],'0']` cell), read per call.

**FLAG-03 is the part that bites here.** This is the visual path, and PURGE-2 turned three
panels black behind an OFF state that satisfied "the feature is inactive." The OFF
assertion must be a **working-product** one: with the flag set, a closed trade still
produces a visible row carrying its id and its P&L text. Not "the window is not applied."

**Ownership:** `talaria-v9-live.js` exists only as build output of `talaria-design/src`
(`vite.config.live.js:142`, `emptyOutDir`). This lands in B's tree. I produce the
diagnosis and the switch design; editing the bundle in mine would be erased by the next
build.

---

## 6. Rows raised

| Row | Detail |
|-----|--------|
| Objects Tree forced remount | `key={…-s${layersSelectionRevision}}` remounts all rows per selection change. Churn, not accumulation — a CPU row, not a memory row |
| Nav-badge tooltip churn | ~7,200 `<strong>` created/hour during replay; released via `replaceChildren()` |
| Collapsed panel stays mounted | `height:0` + `overflow:hidden` at 37948 — closing the drawer releases nothing |
| `tryInstallHostBus` poll | `MultichartGrid.jsx:7750–7753` interval not cleared if the grid unmounts early (bounded ≤5s) |
| `tlChkLastActRef` unbounded | keyed by checkbox id, no delete — **not DOM**, so not the climb |

---

## 7. What I got wrong, stated plainly

I applied first-difference analysis correctly and reached the wrong conclusion, because I
weighted a decorrelation I had *myself* named as non-diagnostic. The lesson is not "do not
difference"; it is that when I write down a bound that makes my own result non-diagnostic,
I have to go looking for that mechanism before I let the result travel. C measured; I
inferred against the measurement and should have gone to source first. Two hours.
