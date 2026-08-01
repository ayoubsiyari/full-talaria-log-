# Prebuild — B-train close gates (Rayan #8 · TAL-01896 · TAL-01807b)

**2026-07-30** · Manager D · not blocked on anyone  
**Script:** `scripts/prebuild-b-train-close-gates.mjs`  
**EVID-02:** `_evidence\manager-D\PREBUILD-B-TRAIN-CLOSE-GATES-<stamp>.json`
**TEST-02:** RED on `20260730b113` is the expected discriminator; GREEN only counts on a later
named stamp with B-train bytes.

## Why this exists

Three ready fixes have sat waiting for a verification cycle after B lands. These gates are
written for the **fixed** state now. On b113 they exit **≠ 0 (RED)** because the bytes are
genuinely absent — that RED is the discriminator. When B ships, the same command with
`--expect-green` exiting **0** closes the rows in one step.

## Rows

| Ticket | Discriminator on b113 | Tip unit gates (run after GREEN) |
|---|---|---|
| Rayan #8 | gap + place-audit kill-switches + `_assertExplicitPlaceAudit` absent (`_m24ReconcileOrderIdCounter` alone is vacuous) | `m24-order-id-gap-after-hydrate.test.mjs`, `order-explicit-place-audit.test.mjs` |
| TAL-01807b | `__TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1` absent | `order-pair-switch-visual-rebind.test.mjs` |
| TAL-01896 | `orderManagerTradeRows` not served / no duration marker | `orderManagerTradeRows.test.mjs` + `.red.test.mjs` |

## Commands

```bash
# Today on b113 — must exit 1 (RED)
node scripts/prebuild-b-train-close-gates.mjs --base http://31.97.192.82:3000 --stamp 20260730b113
node scripts/prebuild-b-train-close-gates.mjs --wire-dir artifacts/wire-b113 --stamp 20260730b113

# After B train — must exit 0
node scripts/prebuild-b-train-close-gates.mjs --base <CANARY> --stamp <NEW> --expect-green
```

No Chromium. HTTP / wire-dir only.

## Measured / refreshed

| Surface | Rayan #8 | TAL-01807b | TAL-01896 | Gate exit |
|---|---|---|---|---|
| `artifacts/wire-b113` (stamped corpus, refreshed 2026-07-31 00:13) | RED | RED | RED | **1** (discriminator) |
| Live canary OM (stamp **unlabelled** — MEAS-01 pending) | GREEN | GREEN | RED | **1** (01896 still out) |

Tip unit gates for #8 / 01807b: GREEN=0 locally. Ledger flip for those two waits on B’s named stamp + `--expect-green` on that stamp. 01896 remains delivery-unserved on live.
