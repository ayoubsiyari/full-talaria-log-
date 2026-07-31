# D1 Follow-Up — J1 Renderer Cost Settles

**Date:** 2026-07-31  
**Manager:** D  
**Artifact:** `docs/plan3/D1-J1-SETTLE-BROWSER-20260731.json`  
**Evidence mirror:** `_evidence/manager-D/D1-J1-SETTLE-BROWSER-20260731.json`

## Verdict

The extra J1 renderer cost is **settled warmup/cache cost**, not a per-render leak.

The repeated-render harness rebuilt the journal-list DOM **12 times** with the same `60` rows × `2`
screenshots (`120` real unique fixture payloads). It retained the J1 thumbnail cache across rebuilds,
matching the intended product shape.

Key result:

- Cycle 1: `120` thumbnail cache misses, full rasterization path exercised.
- Cycles 2-12: `0` misses every cycle.
- Stable tail cycles 4-12:
  - renderer private spread: **1,957,888 bytes**
  - GPU private spread: **253,952 bytes**

That is flat. It is not a `+23 MB` per journal render slope.

## Measurement

The source fixture is the same real chart screenshot used in D1:

- full source: `3331×1556`
- J1 thumbnail: `240×112`
- thumbnail decoded floor per image: `107,520 bytes`
- settled DOM decoded floor per 120-image render: `12,902,400 bytes`

The harness kept full hydrated data-URL strings resident in JS to model `state.journal`, and kept the
thumbnail cache resident across rebuilds to model M20-J1. Each cycle tore down and rebuilt the DOM image
list, then forced GC and sampled Windows renderer/GPU private bytes from Chromium PIDs.

## Process-Counter Reading

Absolute renderer private deltas are noisy in headless Chromium because renderer process accounting moves
during startup. The leak signal is the slope after cache warmup.

The stable tail is cycles 4-12:

| Metric | Tail range | Tail spread |
|---|---:|---:|
| Renderer private delta from baseline | `-8,343,552` to `-6,385,664` | **1,957,888** |
| GPU private delta from baseline | `39,985,152` to `40,239,104` | **253,952** |

The GPU term settles around **40 MB** for this synthetic run. Renderer private does not climb after the
cache is warm.

## Conclusion

Treat the one-shot J1 overhead as a permanent/settled tradeoff, not an accumulating leak. A 23 MB-class
one-time renderer difference against the full-resolution bitmap win is acceptable; there is no evidence
from this repeated-render test that repeated `updateJournalTab()` calls reintroduce a growing bitmap term.
