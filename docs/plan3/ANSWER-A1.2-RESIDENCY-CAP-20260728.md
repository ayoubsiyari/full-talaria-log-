# Answer to §1.2 — can a panel-side residency cap ship independently of the ownership refactor?

**Manager A — Critical Path · 2026-07-28 · Row: C3a · surface= source audit of the named modules and
their call sites, plus the per-tick resample measurement accepted this train · coverage= no live
mixed-4 measurement; the mixed-4 figures below are derived from source and from the resample counters,
not observed on a four-panel layout**

## Short answer

**No — and the question should not be re-asked in this form, because two of its three premises are
false.** A panel-side residency cap using the named modules is not a smaller version of the ownership
refactor. It is approximately a no-op, and the modules it names are not shippable.

Recommendation: **do not build it.** Expected effect on mixed-4 is **≈ 0**, and the honest cost is
**4–6 days to discover that**, most of it spent productionising two reference artifacts.

## The three premises, checked

**Premise 1 — "using the existing audited `visible-window-mirror.mjs` and `reusable-buffer-pool.mjs`."**
False as stated. Both are **reference / test-only** artifacts. They were audited as *artifacts*, and that
audit certified that they behave as described in a harness — it did not certify them as product-ready,
and nothing imports them from a product path. Treating "audited" as "ready to wire" is the error the
question rests on. Productionising them is the bulk of the cost, and it is cost incurred *before* any
measurement exists to justify it.

**Premise 2 — "each panel holding less."** This is the load-bearing one and it is false. **Panels do not
own the bar data.** The host owns `rawData`; panels read from it. There is no per-panel copy to cap, so a
per-panel residency limit reduces per-panel *references*, not bytes. On mixed symbols — our dominant
workflow, and correctly identified in the question as the case where deduplication has nothing to
deduplicate — the win was supposed to come from each panel holding less. Each panel already holds
almost nothing. The memory is in the host, once per symbol, which is exactly where a mixed-symbol
workflow needs it to be.

**Premise 3 — that per-panel duplication is the dominant cost.** Also false, and this is the part that
changes what we should do instead. The measurement accepted this train shows **2.000 full resamples per
replay tick**, allocating one object per output bar, with the cost scaling with total history rather than
with the visible window. That is not per-panel duplication. It is one host-side path allocating the
entire series twice per tick. Rayan's 3.5 GB on a *single* 1m layout is consistent with this and is not
consistent with a per-panel duplication story — there is only one panel.

## What I got wrong and am correcting here

I previously recommended turning down `_highLimitBulkHistorySmartLimit` as an "hours, not days"
host-side alternative, on the belief it was a documented global. It is not documented, and turning it
down reverts the client to many small fetches, which puts **network on the replay path**. That trades a
memory problem for a latency problem on the exact path we are trying to make smooth. Recommendation
withdrawn; it is a trap, not a dial.

## Expected effect on mixed-4

| Change | Expected mixed-4 effect | Confidence |
|---|---|---|
| Panel-side residency cap, as specified | ≈ 0 | high — panels hold references, not bars |
| Host-side bulk-history dial | negative overall | high — reintroduces fetch-on-replay |
| Bounding the resample allocation | large, unquantified | medium — measured per-tick, not yet on mixed-4 |

I will not put a number on the third row. The per-tick resample figure is measured; its mixed-4
translation is not, and inventing one would be exactly the kind of unfalsifiable estimate that got the
memory row reopened in the first place.

## Cost in days

- Panel-side cap as asked, including productionising both modules, wiring, kill-switch and §A7 oracle:
  **4–6 days**, for an expected mixed-4 effect of zero.
- The same 4–6 days spent on the resample allocation path addresses the cost that was actually measured.

## What should happen instead

**Bound the caches rather than capping the panels**, and do it on the host side where the bars actually
live. The specific target is the per-tick full resample, because it is the only memory cost this train
has *measured* rather than inferred.

That work is currently gated behind one open item: `fullRawData.length` on a real session, which is my
outstanding `PO-REQ`. Until that number exists, the resample row's scale is bounded in source but never
observed live, and I am not willing to schedule C3a-full against a source-derived bound after being
wrong about a source-derived bound once already tonight.

**C3a as currently shaped is aimed at per-panel duplication.** On the evidence, the target is host-side
allocation. That is a re-aim, not a delay.
