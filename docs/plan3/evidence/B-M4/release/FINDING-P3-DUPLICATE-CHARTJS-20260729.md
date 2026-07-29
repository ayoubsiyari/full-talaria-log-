# FINDING — Duplicate P3 on chart.js (B tip vs A canonical)

**When:** 2026-07-29  
**Owner:** Manager B  
**Resolution rule:** A's `chart.js` is canonical. B does not write `chart.js`.

---

## Commits

| | SHA | Author stamp | Parent |
|---|---|---|---|
| **A (canonical)** | `ff5149c64` | 2026-07-29 11:44 +0100 | `3e75ed996` |
| **B (duplicate tip)** | `cdbef640c` | 2026-07-29 12:28 +0100 (message date 11:44) | `8d9e65c11` |

Same subject / same 3 paths / same test blob `847cb632…`.  
**`chart.js` blobs differ:** A `5094522056…` vs B `e33cadc716…`.

---

## P3 bar-store region

Extracted `_mcBarStoreRealmSwitchEnabled` … `_releaseSharedBarStoreFileRefs` (+ body):  
**byte-identical** between A tip and B tip (same region hash).

P3 itself is the same implementation on both tips. Not two different P3 logics.

---

## What B's assembled tip has that A's does not

Full-file diff A→B = **+6 / −17** outside the P3 region (same delta already on the **parents** before either P3 commit):

| Site | A (canonical) | B tip (divergent) |
|---|---|---|
| `CHART_ENGINE_BUILD` | `'20260724b61'` | `'20260728b82'` |
| Q9 `updateChartDataFast` wrap install | **Unconditional** install; switch read per call inside wrapper (FLAG-02) | Still gated by `_talariaM20Q9McDiagCountersDisabled()` at **install** time |
| M23 host-commit teardown hook | **Unconditional** install; switch at teardown site; long FLAG-02 comment | Early-return gate on `__TALARIA_DISABLE_M23_HOST_COMMIT_TEARDOWN_V1 === true` **before** install completes; missing A's comment |

**Nothing unique in B's P3.** B is behind on A's Q9/M23 unstrand work and carries a local engine-build string. Taking A's blob closes all three.

---

## Action

1. Checkout A's tip `chart.js` / `homepage/public/chart/chart.js` blob `5094522056…` onto B tip (train align — not a B authorship).  
2. Standing rule: **B does not edit `chart.js`**. Leak shots needing it → escalate to A.  
3. Continue train with LEAK-C (`f5ee11780`, multichart only).
