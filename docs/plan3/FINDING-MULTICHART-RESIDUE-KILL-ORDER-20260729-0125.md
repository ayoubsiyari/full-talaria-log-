# FINDING + KILL ORDER — The PO's 4-panel session produces the sharpest memory dataset we have. **Most of the climb is transient and returns**: 1.4 GB → 860 MB within seconds of pause, → ~700 MB three minutes later untouched. **The residue is ~250 MB above the 450 MB idle baseline, and it did not release when the layout dropped from four panels to one.** The layout-reconcile path is correct in source, so the suspect is parent-side per-panel state that `removeChart` never purges. Shooting at that now rather than investigating further.

**2026-07-29 01:25. PO directive: "there is a hoarder amongst the multicharts, I want it dead, Russian hitman style, no stupid time wasting investigations, just pure speed and efficiency."**

---

## 1. The dataset, and what it already rules out

**4 panels, four different symbols, four different timeframes, 2 indicators each:**

| state | memory | CPU |
|---|---|---|
| idle | ~450 MB | — |
| loading | ~550 MB | — |
| played, 5× | ~860 MB | — |
| 5 min at 5× | ~1.1 GB | 120-140% |
| 3 min at 60× | ~1.4 GB | ~160% |
| **paused, seconds later** | **~860 MB** | 20-30% |
| **+3 min untouched** | **~700 MB** | 10-30% |
| **switched to single chart** | **~700 MB, no drop** | ~10% |
| single chart played | ~1.3 GB | ~160% |

**The pause behaviour is the most informative line in the table and it is good news.** **1.4 GB → 860 MB in seconds, then → 700 MB over three idle minutes, means roughly 700 MB of the peak was transient and collectable.** That is working set and garbage under churn, not retention. **It also independently confirms FIX 2's cancellation was right**: if allocation churn were being retained we would not see it handed straight back.

**So the retained figure is ~700 MB against a ~450 MB four-panel idle baseline — a residue near 250 MB.** That is the Hoarder's actual size. **It is much smaller than the 1.4 GB peak suggested, and that matters because it changes what we are hunting.**

**The unambiguous defect is the next line: dropping from four panels to one released nothing.** Three panels' worth of engines, data and indicators should have gone. Memory sat at 700 MB.

## 2. What the source says, which forces the suspect

**The reconcile path is correct.** `MultichartGrid.jsx:2841-2845` iterates `mgr.charts.keys()`, and for any id absent from the new layout calls `mgr.removeChart(existingId)`. **`multichart-manager.js:518-550` then calls `replaySystem.destroy()` under the M26 gate (532-536), removes the iframe (547), and deletes the map entry (548).**

**So panel teardown is wired to layout change, and M26 fires there. That is the only place it fires.**

**Two consequences.** First, the earlier hypothesis that layout switching never tears panels down is **refuted by source** — I am recording that before it spreads. Second, **since the manager's own bookkeeping is cleaned and the iframe is removed, the surviving 250 MB is very unlikely to be inside the manager.**

**That points at the parent.** The reconcile loop purges exactly five parent-side structures: `hostSyncedPanelsRef`, `primedPanelsRef`, `overlayHoldTimersRef`, `readyPanels`, `dataReadyPanels`. **The multichart parent maintains considerably more per-panel state than that** — host-to-panel data cloning, visible-window mirrors, and the buffer pooling in `m21-w6-fixtures/visible-window-mirror.mjs` and `reusable-buffer-pool.mjs` all key data by panel. **Any structure keyed by panel id that is not in those five lines retains that panel's data forever, and candle data is precisely the heavy thing.**

**This also explains why M26 measured as `effect not demonstrated`.** M26 releases arrays *inside the panel's own engine*. **If the parent holds its own clone of that panel's data, releasing the panel's copy frees nothing measurable** — which is exactly the null result A reported and could not explain.

## 3. Kill order — A, immediately, no further investigation

**Enumerate every structure in the multichart parent keyed by panel id, and purge each one in the reconcile removal loop.** Behind `__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1`, default on.

**Acceptance under `GATE-01`: with the switch set, four-panel-to-one must retain; with it clear, it must release.** The PO's session is the grading instrument. **Do not build a harness for this** — A's harness already failed to see M26 and there is no reason to trust it here.

**One confound must be controlled before any of this is graded, and it is mine to name rather than A's to discover.** **The PO's single-chart reading of 1.3 GB and 160% may have been taken with the speed still at 60×**, since it followed the 60× multichart run. **A single chart at 60× may legitimately cost that.** A's own measurement that `tickIntervalMs` floors near 250-300 ms means both one panel and four are tick-limited at high speed, so their costs can converge for honest reasons. **Until a fresh-tab single chart at 60× is measured, the 1.3 GB figure cannot be attributed to multichart residue, and I will not let it be used as evidence either way.**

## 4. Instrument correction for all future memory readings

**Task Manager reports process memory, which includes pages V8 has freed but not returned to the OS.** `performance.memory.usedJSHeapSize` reports the JS heap. **Every memory figure in this project so far has been the former.** That does not invalidate the residue — a 250 MB gap that survives three idle minutes and a layout change is real — but **it means some portion of every "did not drop" observation may be unreturned pages rather than retention**, and we have never separated the two.

**Binding from now on: memory observations carry both numbers, and are taken after an explicit forced collection.** Anything else measures the allocator's mood.
