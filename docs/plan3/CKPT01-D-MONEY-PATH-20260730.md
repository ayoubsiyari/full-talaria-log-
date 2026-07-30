# CKPT-01 — Manager D money-path (binding)

**Authority:** `AMENDMENT-DIRECTOR-RUNS-THE-MILES-20260730-1445.md` §3  
**Checkout tip at take:** `d5b790e56` (`d5b790e56012530fb7f4cc3911d5606f0a71b51f`)  
**Annotated tag:** `ckpt/pre-d-money-conf01-d5b790e56`

A checkpoint is required **before** any risky D landing (order-manager / journal / money-path product change under CONF-01). Gate-only or docs-only commits are not risky landings. Product edits to `order-manager.js` (canonical or homepage) **are**.

---

## Four required pieces (or the landing does not start)

| # | Requirement | This checkpoint |
| --- | --- | --- |
| 1 | Annotated tag `ckpt/pre-<landing>-<buildid>` on exact train tip; MEAS-01 when a served page exists | Tag `ckpt/pre-d-money-conf01-d5b790e56` on tip. MEAS-01 stamp = TBD until B serves a build; tip SHA is the train ID until then. |
| 2 | Retained deployable artifact (bytes that already ran — not a rebuild) | Primary: annotated-tag tree blobs for both `order-manager.js` paths at `d5b790e56`. Operational redeploy copy: `artifacts/ckpt/pre-d-money-conf01-d5b790e56/` + `SHA256SUMS.txt` (SHA `A788A611…2D0D68`). |
| 3 | Kill-switch on the **landing** (`FLAG-01` ABSENT / `FLAG-02` no-reload / `FLAG-03` OFF vs working-product assert) | Declared per landing before write starts. Existing money flags already in tree (M24 display stability, gap reconcile, explicit-place audit, MC host-order retain, …) must be reused when the mechanism matches; mint only when none fits. |
| 4 | Rollback **executed while still green**, before the landing | **Exercised 2026-07-30:** probe file corrupted → restored from retained artifact → SHA matched pre-corruption; tip money gates still GREEN (`m24-order-id-restore-stability`, `order-mc-layout-teardown-retains-host-orders`). |

---

## Rollback recipe (redeploy bytes — never rebuild)

```text
# From manager-d-trade tip matching the tag (or after a bad landing):
copy artifacts\ckpt\pre-d-money-conf01-d5b790e56\order-manager.chart.js ^
  "chart v 1.4\chart\modules\order-manager.js"
copy artifacts\ckpt\pre-d-money-conf01-d5b790e56\order-manager.homepage.js ^
  homepage\public\chart\modules\order-manager.js
# Verify SHA256SUMS.txt, then:
node "chart v 1.4/chart/modules/m24-order-id-restore-stability.test.mjs"
node "chart v 1.4/chart/modules/order-mc-layout-teardown-retains-host-orders.test.mjs"
```

Kill-switch OFF is the first retreat for a flagged landing; if the switch itself is unsafe (PURGE-2 class), restore the retained bytes above.

---

## Standing rule for D

Do not ask the Director for permission inside the CONF-01 dispatch. Journal the checkpoint take / landing / rollback result and keep moving. Contact the PO only when something is ready to test, or when Commitment §2 cannot be met.
