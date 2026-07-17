# Checkpoint deploy log (D-031)

Each entry is the ≤10-line manager report per deploy: build id · contents · re-verify · watch · rollback.

---

## CKPT-001 — 20260717b42 (A6-4 host-canonical order store) — 2026-07-17
- **Build:** `20260717b42` (host + panel-B iframe + dist-v9)
- **Contents:** A6-4 cross-ticker order fix (ESC-026/D-030) — steps 0–6 + ready-panels fan-out + owning-panel-price stopgap; I16 order-persist stamping (b43 folded); H-R09 chrome live-resolve hardening (D-024/ESC-027).
- **Fix IDs / tickets:** ORD-XPNL, ORD-DUP-DURATION (with interims), TAL-01665n/a, cross-ticker PnL; I16 (D-031); H-R09/H-R04.
- **Re-verify (PO, build must read `20260717b42`):** the 7-row `A6-4-b38-PO-LIVE-CONFIRM-CHECKLIST.md` (now on b42) — cross-ticker GBP≠EUR price, panel-B place/lockout, SL drag converge, dual-replay PnL, F5 no-dup + iframe lines, DUP-2, DURATION-1/2. Plus I16 spot: close a trade → row carries `build_id:"20260717b42"`.
- **Watch items:** H-R05 **failing acceptance row** (harness **9/10** on b42 ckpt001 rerun; prior 6–8/10) — pre-existing panel-B dom-ready flake, DECOUPLED per D-032, **NOT green**, NOT quarantined; bound to **CHROME-STAB-01** (review at post-bless T8). Tripwire: `d032-tripwire-outcomes.jsonl` logs `storeOk` / `v9BarVisible` / `modalTeardown` on every failing H-R04/H-R05/H-R09 run; D-026 teardown sig or `storeOk=false` → same-day escalation.
- **Deploy (tester):** push + `./scripts/vps-deploy-after-pull.sh homepage` on VPS (`/opt/talaria`); PO must hard-refresh and confirm `__TALARIA_CHART_BUILD_ID === 20260717b42` on host + panel-B iframe before checklist. **Agent deploy attempt 2026-07-17:** SSH to `root@srv904606` timed out from dev shell — **manual deploy required** (dist b42 already in repo at `homepage/public/chart/dist-v9/`).
- **Rollback switches:** `__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX` (A6-4 master), `__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1` (stopgap), `__TALARIA_DISABLE_ORDER_MC_READY_PANELS_SNAPSHOT_V1` (fan-out), `__TALARIA_DISABLE_ORDER_PERSIST_STAMP_V1` (I16), `__TALARIA_DISABLE_V9_QUICKBAR_LIVE_RESOLVE_V1` (H-R09).

---

## CKPT-002 — 20260717b73 (A6-4 + PO order/replay/cadence + crash pin) — 2026-07-17
- **Build:** `20260717b73` (host + panel-B iframe + dist-v9); git `1666b7171` + Lane 4 harness (`MC-PEER-DESELECT-SCOPE`)
- **Contents:** A6-4 switches + owning-panel-price (`__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1`); I16 `build_id`+`schema_version` stamping; PO manual multichart order/replay/cadence (D-016 candle-mode V1 in `replay-system.js`); `cancelScheduledPeerDeselect` grid export + typeof guards (MultichartGrid.jsx:6256/7106/7187); MC-DRAW-FIRSTCLICK; MC-PEER-DESELECT-SCOPE harness pin.
- **Duplicate-fix check:** owning-panel-price = single kill-switch path (worker `order-owning-panel-price.mjs` + runtime mirror in `order-manager.js` — aligned, not fighting). Cadence = engine-owned in `replay-system.js` (V1 switches); MultichartGrid only broadcasts via `getReplayStepTimeframeForSync()` — complementary, not duplicate math.
- **Re-verify (PO):** confirm `__TALARIA_CHART_BUILD_ID === 20260717b73`; cross-ticker order PnL; candle PLAY 4h-main + 1m-peer; panel-B select (no console ReferenceError); close trade → row has `build_id` + `schema_version:1`.
- **Watch:** H-R05 harness row still NOT green (CHROME-STAB-01); manager gate ratchet wants H-S59b/H-S83b promoted from known-failing (both PASS this cycle — 0 regressions).
- **Rollback switches:** `__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX`, `__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1`, `__TALARIA_DISABLE_ORDER_PERSIST_STAMP_V1`, `__TALARIA_DISABLE_FINEST_TF_CANDLE_CADENCE_V1`, `__TALARIA_DISABLE_FINEST_TF_STEP_FORWARD_CADENCE_V1`, `__TALARIA_DISABLE_REPLAY_INTERVAL_OWNER_V1`, `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1`.
