# Manager C — Status for Director

**Branch:** `manager-c/verification-infra`  
**As of:** 2026-07-29 (wall)  
**Role:** Verification infra only — nothing A ships is graded without C’s instruments.

---

## Executive summary

C’s **critical path is now the heap-cycle memory gate**. PO manual footprint measurement is retired. Prior M26 / FIX 3 “effect not demonstrated” verdicts against Task Manager are **void / UNGRADED**. On the proper instrument, M26 is expected **correct but insufficient** (leak remains).

CPU / lag / P4 honesty instruments are landed. Presence soft-passes (**W63f**) stay **parked**.

---

## Landed (ready for Director check)

| Packet | Commit | What | Evidence |
|--------|--------|------|----------|
| **W67** heap-cycle gate | `00547509b` | `HEAP-CYCLE-MEMORY-V1`: 3 cycles, distinct symbols (25/27/28/29), `usedJSHeapSize` + forced GC, **Detached / retained `<div>`** superior cell | Unit 7/7; **fixture RED**; **live RED** |
| **W66** heap metric fix | `9cd79e9a2` | Grade memory on `performance.memory.usedJSHeapSize` after forced GC; footprint non-grading | Unit pass; PO protocol updated |
| **W64c + W62l** | `1765a5684` | Lag hygiene (P4 couple, indexDelta, types[], no speed-10 vacuity); P4 either-fingerprint + relative epsilon | Unit 50/50 |
| **W64b** FIX1 smoothness | `56477130a` | **R-W64 ACCEPT** (p95FrameMs-only; shared LT attribution) | Unit pass |
| **W65** soak exempt | `af0998540` | Named journal-warn exemption; soak unblocked | Soak M19-GREEN |
| **SURF-3** | `12c2fd56b` | V9 build-id agreement gate; GATE-01 b75≠b82 sealed | Fixture RED; live RED at capture |

---

## Memory instrument (critical path)

**Gate:** `npm run preflight:heap-cycle-memory` / `:fixture`  
**Signature:** `TALARIA_HEAP_CYCLE_MEMORY_V1`

| Cell | Role | Today |
|------|------|--------|
| `HEAP-CYCLE-DETACHED-DIV-STABLE` | **Superior / mandatory** | Fixture RED (+21 699/cycle); live: CDP detachedness often 0 on thin `host.html` → grades retained `HTMLDivElement` growth |
| `HEAP-CYCLE-HEAP-FLOOR-BOUNDED` | Heap floor after each return-to-single | Fixture RED (~50 MB/cycle); **live ~20 MB/cycle RED** |
| `M26-REGRADE-ON-HEAP-CYCLE` | Regrade | **INSUFFICIENT** while leak remains |
| `FIX3-REGRADE-ON-HEAP-CYCLE` | Regrade | **INSUFFICIENT** while leak remains |

**PO calibration pinned:** baseline 54 MB → R1 106 / R2 152 / R3 204; detached **+21 699/cycle**.  
**GATE-01:** must stay RED on unfixed product — **proven** (fixture + live).

---

## Retainer hypothesis (open — not closed)

Residue scales with **distinct symbol/TF datasets**, not panel count.

| Rank | Suspect | Note |
|------|---------|------|
| 1 | Host `__talariaBarStore` (`fileId → tf → bars`) | `clearFile` never called from `removeChart` |
| 2 | Host `_tfDataCache` / `_smartPrefetchCache` | Survive panel close |
| 3 | Same-pair `fullRawData` alias vs distinct copies | Explains identical vs distinct differential |
| Low | `viewport-data-manager` / `chart-data-pipeline` | Per-Chart single-slot — secondary unless Charts stay pinned |

**M26:** teardown path wired on train tip; expected **not** to clear this leak when measured properly → **INSUFFICIENT**, not “failed against footprint.”

---

## CPU / lag / P4 (landed, honest RED where product unfixed)

- **FIX1 smoothness instrument:** ACCEPT (W64b).  
- **W64c hygiene + W62l P4 mirror:** landed; four-panel lag credit blocked when `sharedMirrorOnly`.  
- **P6 margin:** stays **0.03** (do not soft-pass).  
- **W63f** (JS-loader presence soft-passes): **parked**.

---

## How to re-check quickly

```bash
npm run test:heap-cycle-memory
npm run preflight:heap-cycle-memory:fixture   # expect RED
npm run preflight:heap-cycle-memory           # expect RED on unfixed
npm run test:po-cpu-ab
npm run test:surf3-build-agreement
```

---

## Asks / decisions for Director

1. **Accept HEAP-CYCLE-MEMORY-V1** as the sole grader for M26 / FIX 3 / residue (PO footprint retired).  
2. Confirm **M26 = correct but insufficient** is the standing expected outcome until a data-cache purge lands (A).  
3. Whether live detached counts should next target **React MultichartGrid / dist-v9** (closer to PO +21 699) vs current thin harness (heap RED already; CDP detachedness often vacuous).  
4. **W63f** stay parked until you order presence work above memory/CPU canary.

---

## One-line for the board

**C can grade: heap-cycle (critical), lag dual-metric, P4 honesty, SURF-3, soak. Memory footprint verdicts void. M26/FIX3 → INSUFFICIENT on proper heap. Residue likely host bar-store / TF caches. W63f parked.**
