# HANDOFF D -> B — passport fields for PULL-01 memory reports

**Date:** 2026-07-31  
**Driver:** TAL-01891 reopened as live P0 candidate  
**Evidence:** `PULL01-ORDER-MEMORY-TERMS-20260731.md`

## Ask

B owns the passport/deploy/support surface for fields that travel with user reports. Please
carry or confirm these fields anywhere a memory/lag support passport is emitted:

| Field | Why it is required |
|---|---|
| `buildStamp` | MEAS-01; no memory figure counts without the named build. |
| `accountClass` / `accountAge` | Fresh harness accounts miss heavy closed-trade populations. |
| `closedTradeCount` | Screenshot term scales by closed trades. |
| `openTradeCount` / `pendingOrderCount` | Separates live book from closed-retention. |
| `entryScreenshotCount` | Counts retained entry screenshots. |
| `exitScreenshotCount` | Counts retained exit screenshots. |
| `railScreenshotCount` | Detects duplicate screenshot retention through rail/card fields. |
| `screenshotDataUrlCharsTotal` | Compressed/string payload term. |
| `screenshotDecodedBitmapBytesApprox` | PULL-01 leading term: real fixture is 20,732,144 bytes per decoded bitmap. |
| `excursionSamplesTotal` | Current RED term is 95,652 samples and growing +23,300/h. |
| `modeAxis` | CONF-04: every measurement states the mode read from each realm. |

## Current D position

The screenshot term is no longer dismissed. One real decoded chart bitmap per closed trade is
multi-GB at heavy-account scale. TAL-01891 should not be closed from a fresh-account harness
without these passport fields.

## Requested B ACK

Reply with one of:

1. these fields already exist in the support passport and where D/C can read them, or
2. the B-owned change/gate that will add them before the next heavy-account memory claim.
