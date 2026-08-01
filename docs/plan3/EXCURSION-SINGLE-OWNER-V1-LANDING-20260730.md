# EXCURSION-SINGLE-OWNER-V1 — landing

**2026-07-30** · Manager D · answers Director `e8ba8bdbc` (duration gate RED / excursion kill)  
**Flag:** `window.__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1` (ABSENT ⇒ ON)  
**Grading:** harness GREEN only — **C grades on the wire** (`DECL-01`). Not the memory win.

## What the gate counted

At the final duration-gate sample, three list names each reported 12,762 excursion samples
for the same 40 trades. That is not three heap owners:

| list | what it is |
| --- | --- |
| `managerClosed` | `orderManager.closedPositions` |
| `serviceClosed` | **same array** via `bindServiceProp` in the OrderManager ctor |
| `managerJournal` | separate row objects; previously held `.slice()` copies of the series |

Authoritative list: **`tradeJournal`**. Closed/service are one hot working set; after the
post-exit bound, TRADE-EVICT nulls their excursion keys and the journal keeps the arrays.

## Cap (319 vs 256)

Not a product breach. C's `excursionSamples` sums four keys
(`bar_close_r`, `bar_high_r`, `bar_low_r`, `post_exit_bar_close_r`), ceiling **1,024**.
`12,762 / 40 ≈ 319` sits under that. Documented in C FINDING 21:10. A hard-cap belt still
ships on every append so a skipped binder cannot leave a live series above 256.

## Product change

1. Journal adopt shares array identity with the hot row (no `.slice()` dual copy).
2. TRADE-EVICT release of closed (and therefore serviceClosed) leaves journal as sole owner.
3. `_excursionSingleOwnerV1HardCapLiveTails` after `_appendExcursionSnapshot`.

## CONF-02 measured figure (excursion arrays only)

| | Bytes |
|---|---:|
| Legacy deduped closed+journal (flag OFF) | **390,240** |
| Product journal-only after evict (flag ON) | **195,120** |
| Delta | **195,120** (~191 KB) |

Screenshots excluded. Open positions retained separately (small). **Do not quote as the
memory win** — Director expects small; 730 MB/h is A's. Evidence under
`_evidence/manager-D/` per EVID-02.

## Gates

- GREEN: `excursion-single-owner-v1.test.mjs`
- RED: `TALARIA_TEST_DISABLE_EXCURSION_SINGLE_OWNER=1` → `.red.test.mjs` exits ≠ 0
- Byte cell: `excursion-single-owner-v1-conf02-bytes.test.mjs`
