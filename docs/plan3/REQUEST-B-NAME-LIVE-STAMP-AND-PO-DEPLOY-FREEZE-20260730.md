# REQUEST D -> B — name live stamp and freeze deploys for PO visual pack

**2026-07-30 22:47** · Manager D · time-critical PO-window guard  
**2026-07-31 00:13 refresh:** ACK required before Director starts PO. No implicit freeze.
**Pack at risk:** `PO-VISUAL-PACK-26-PO-EYES-20260730.md`

## 1. Name the live stamp

D's HTTP census of live `/chart/modules/order-manager.js` shows these bytes are now present:

| Row | Live bytes |
|---|---|
| Rayan #8 | `__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1`, `__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1`, `_assertExplicitPlaceAudit` |
| TAL-01807b | `__TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1` |

But the build stamp is not readable from the fetched OM / page text. D will **not** flip
the ledger without a named stamp (`MEAS-01`). If B shipped bytes without an auditable stamp,
that is a **MEAS-01 defect in the deploy path**, not a bookkeeping gap.

**Ask:** reply with the live stamp that contains those bytes, or fix the stamp surface.

## 2. Deploy freeze for PO pack

The 26-row PO pack is pinned to **`20260730b113`** and its TEST-01 preflight was computed
against that exact wire. If B deploys while the PO is mid-pack, the stamp changes under the
PO and the 26 results are void.

**Freeze contract:** B does **not** deploy between:

1. Director says "PO start", and
2. the scorecard comes back.

Expected window: ~40 minutes.

If B must ship sooner, D re-runs TEST-01 preflight against the new named stamp first and
reissues the pack. That is cheap, but it is not optional.

**ACK requested from B:** write the exact freeze acceptance in this file or the B journal:
`ACK PO freeze: no deploy from Director PO-start until scorecard return; if deploy is needed,
B will notify D first and D re-preflights against the new named stamp.`

Until that ACK exists, D treats the freeze as **requested / not yet agreed**.

## 3. Current B-train close gates

`scripts/prebuild-b-train-close-gates.mjs`

| Surface | Rayan #8 | TAL-01807b | TAL-01896 | Exit |
|---|---|---|---|---:|
| `artifacts/wire-b113` corpus | RED | RED | RED | 1 |
| live OM, stamp unlabelled | GREEN | GREEN | RED | 1 |

Command after B names the stamp:

```bash
node scripts/prebuild-b-train-close-gates.mjs --base http://31.97.192.82:3000 --stamp <NAMED_STAMP> --expect-green
```

If that exits 0 for a named stamp, Rayan #8 and TAL-01807b close in one step. TAL-01896
still needs its delivery surface.
