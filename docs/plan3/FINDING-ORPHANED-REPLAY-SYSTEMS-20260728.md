# FINDING — Test 1 result. The leak is real and multichart-correlated. It is NOT leaked documents; it is orphaned ReplaySystems, and the teardown skips their `destroy()`.

**2026-07-28 15:36. PO heap snapshots, test server, `31.97.192.82:3000/chart/index.html?mode=backtest&sessionId=887`. Supersedes my 15:12 hypothesis and withdraws Ruling M-5.**

---

## 1. The leak is confirmed and it tracks multichart use

`Detached <div>` count across three PO snapshots:

| Snapshot | Detached `<div>` | Retained | Delta |
|---|---|---|---|
| 1 — before any multichart | **19,852** | 17,815 kB | — |
| 2 — after multichart, back to single chart | **21,097** | 18,791 kB | **+1,245** |
| 3 — after further cycles | **22,151** | 19,072 kB | **+1,054** |

**Going to multichart and back does not return to the starting state.** `Detached blink::UniqueElementData` moves with it, 28,329 → 29,682 → 30,469. **Monotonic, roughly 1,100–1,250 detached divs per cycle.**

## 2. My 15:12 hypothesis is NOT what the data shows

**I predicted leaked whole `HTMLDocument` and `Window` objects from un-unmounted React roots in panel iframes. There is no `Detached HTMLDocument` row in the PO's filtered snapshot.** The panels' documents are being collected.

**One caveat before this is called settled:** the PO sorted by size, and a detached document has a *small* shallow size with a large retained size, so it could sit below the visible rows. **Confirm by filtering the class box for `Document` rather than by scanning a size-sorted list.** Until then this is "not in the top forty by shallow size," which is weaker than "absent."

**Either way it is not the dominant term, and my 15:12 characterisation was wrong.** Fourth unverified premise today. The chain I built from `createRoot` without `.unmount()` was plausible, internally consistent, and not what is actually happening.

## 3. What the data actually shows — and it is better than my hypothesis

**Snapshot 2, taken in a single-chart state, contains FOUR `M20Q6ReplaySystem` instances:**

| Instance | Retained | Distance |
|---|---|---|
| 1 | 7,266 kB | 16 |
| 2 | 7,266 kB | 16 |
| 3 | 7,265 kB | 16 |
| 4 | 7,053 kB | 4 |

**`ReplaySystem = M20Q6ReplaySystem` (`replay-system.js:10214`) — this is *the* replay engine class, not a helper.** A single-chart state should hold exactly one. **Three of the four sit at distance 16 while the live one sits at distance 4: three orphans, deeply retained, roughly 29 MB between them.**

**Corroborating, same snapshot:** `Window [JSGlobalObject] / http://31.97.192.82:3000` **×2** (7,401 kB) where one page should have one; `blink::RegisteredEventListener` **×1,098**, `EventListener` **×1,098**, `V8EventListener` **×874**; `MediaQueryList` **×4** — matching the replay-system count; and a `Pending activities` node retaining **5,541 kB**, which indicates async work still registered.

## 4. Mechanism located exactly, and it is a small fix

`M20Q6ReplaySystem` **has a real, non-stub `destroy()`** at `replay-system.js:10179`:

```js
destroy() {
    if (this.chart && typeof this.chart._b70ShadowDisposeIndicatorGeneration === 'function') {
        this.chart._b70ShadowDisposeIndicatorGeneration();
    }
    return m20Q6DrainState(m20Q6States.get(this), 'destroy');
}
```

**The multichart panel teardown never calls it.** `multichart-manager.js:583-588` does this instead:

```js
const panelChart = c.frame && c.frame.contentWindow && c.frame.contentWindow.chart;
if (panelChart && typeof panelChart._b70ShadowDisposeIndicatorGeneration === 'function') {
    panelChart._b70ShadowDisposeIndicatorGeneration();
}
```

**That is the first statement of `destroy()`, hand-copied into the teardown, with the second statement dropped.** The indicator generation is disposed; **`m20Q6DrainState` never runs, so the replay system is never drained and stays alive with its listeners and pending activities attached.**

**Someone inlined half a destructor.** The teardown already destroys the Q7 command bridge and the Q5 sync bridge in the same block, each guarded, each behind a named kill-switch — **so the fix is a fourth entry in a list of three, calling `destroy()` on the panel's replay system instead of reaching past it for one line.**

## 5. This is the residue theory, with an object name

**Three orphaned replay engines with live listeners and registered async work is exactly the "lag is session-history dependent" finding, no longer a hypothesis.** The PO's original complaint — progressive lag during replay, only with drawings, orders or indicators present — is consistent with orphaned engines still holding subscriptions. **Whether they still tick is the next question and it is directly testable: instrument the orphans and see if they receive events.**

**This makes the memory monster and the lag monster plausibly the same monster.** I have called them separate all day.

## 6. Ruling M-5 is WITHDRAWN

**M-5 made "detached document count, target zero" the headline memory metric. It reads zero — or absent — on a session that is demonstrably leaking.** A metric that shows green during the defect it was chosen to track is worse than no metric, and I picked it from a retainer reading I had not confirmed.

**Replaced by `M-6`, two counts, both from a single-chart state after multichart use:**

1. **`M20Q6ReplaySystem` instance count must equal exactly 1.** Any orphan is a fail.
2. **`Detached <div>` count must not grow across a multichart open/close cycle.**

**Neither needs the C-2 paired-measurement treatment — these are object counts, not CPU percentages, and they have no 4.5-point noise floor.** The PO's three snapshots are monotonic, which is already stronger evidence than anything we have on CPU.

## 7. Not explained, and named so it is not quietly dropped

**19,852 detached divs existed *before* any multichart was opened.** The per-cycle growth is a second population on top of a large pre-existing one. **Fixing the teardown addresses the growth, not the baseline.** Do not let a green per-cycle delta be reported as a fixed leak.

## 8. Dispatch — Manager A

**This outranks M25 and SURF-1.** M25's ceiling is a few CPU points; this is ~29 MB of orphaned engines per session plus the likely root of the lag complaint.

1. **Call the panel replay system's `destroy()` in the `removeChart` teardown**, in the same block and the same guarded style as the Q5/Q7 bridge destroys, replacing the hand-inlined `_b70ShadowDisposeIndicatorGeneration()` reach-in. **Kill-switch required, matching the three siblings.**
2. **Verify against `M-6`**, not against a megabyte figure — A's own harness-scenario doubt means byte totals are not yet trustworthy.
3. **Then determine whether the orphans still receive events**, which decides whether this closes the lag complaint or only the memory one.
4. **Confirm §2** by filtering the heap for `Document` so the leaked-document question is closed by evidence rather than by my retraction.
