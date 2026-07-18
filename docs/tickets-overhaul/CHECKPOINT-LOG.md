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

## CKPT-003 — 20260717b44 (MC-DRAW-FIRSTCLICK draw-on-click-1) — 2026-07-17
- **Build:** `20260717b44` (draw-only cut; host + panel-B iframe + dist-v9)
- **Contents:** MC-DRAW-FIRSTCLICK — parent armed shape inherits on iframe pointerdown (`__TALARIA_DISABLE_MULTICHART_ARMED_DRAW_FOCUS_FORWARD_V1`); harness `MC-DRAW-FIRSTCLICK` 10/10 ON + switch-OFF 10/10 RED (2026-07-17 rerun PASS).
- **Re-verify (PO):** confirm `__TALARIA_CHART_BUILD_ID === 20260717b44`; arm rectangle on host A → single click on unfocused panel B starts draw (not focus-then-second-click). See RETEST-CHECKLIST **MC-DRAW-FIRSTCLICK** row (+1).
- **Watch:** isolated from A6-4 bundle — PO sign-off closes scoreboard row only; does not bless H-R05.
- **Deploy (tester):** push + `./scripts/vps-deploy-after-pull.sh homepage` on VPS; hard-refresh host + panel-B iframe. Agent SSH often times out — manual deploy OK.
- **Rollback:** `__TALARIA_DISABLE_MULTICHART_ARMED_DRAW_FOCUS_FORWARD_V1`.

---

## CKPT-002 — 20260717b73 (A6-4 reconcile + PO order/replay/cadence + crash pin) — 2026-07-17
- **Build:** `20260717b73` (host + panel-B iframe + dist-v9); git `1666b7171` + Lane 4 harness (`MC-PEER-DESELECT-SCOPE`)
- **Contents:** A6-4 switches + owning-panel-price (`__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1`); I16 `build_id`+`schema_version` stamping; PO manual multichart order/replay/cadence (D-016 candle-mode V1 in `replay-system.js`); `cancelScheduledPeerDeselect` grid export + typeof guards (MultichartGrid.jsx:6256/7106/7187); MC-PEER-DESELECT-SCOPE harness pin. *(MC-DRAW moved to CKPT-003/b44.)*
- **Duplicate-fix check:** owning-panel-price = single kill-switch path (worker `order-owning-panel-price.mjs` + runtime mirror in `order-manager.js` — aligned, not fighting). Cadence = engine-owned in `replay-system.js` (V1 switches); MultichartGrid only broadcasts via `getReplayStepTimeframeForSync()` — complementary, not duplicate math.
- **Re-verify (PO):** confirm `__TALARIA_CHART_BUILD_ID === 20260717b73`; cross-ticker order PnL; candle PLAY 4h-main + 1m-peer; panel-B select (no console ReferenceError); close trade → row has `build_id` + `schema_version:1`.
- **Watch:** H-R05 harness row still NOT green (CHROME-STAB-01); manager gate ratchet wants H-S59b/H-S83b promoted from known-failing (both PASS this cycle — 0 regressions).
- **Deploy (tester):** push + `./scripts/vps-deploy-after-pull.sh homepage` on VPS; PO confirms `__TALARIA_CHART_BUILD_ID === 20260717b73` after hard-refresh. Deploy after CKPT-003/b44 draw verify if sequencing PO rows.
- **Rollback switches:** `__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX`, `__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1`, `__TALARIA_DISABLE_ORDER_PERSIST_STAMP_V1`, `__TALARIA_DISABLE_FINEST_TF_CANDLE_CADENCE_V1`, `__TALARIA_DISABLE_FINEST_TF_STEP_FORWARD_CADENCE_V1`, `__TALARIA_DISABLE_REPLAY_INTERVAL_OWNER_V1`, `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1`.

---

## CKPT-004 — 20260718b01 (CORE-1 D-029 R2 axis-margin floor) — 2026-07-17
- **Build:** `20260718b01` (single post-bless `chart.js` reopen — host + panel-B iframe + dist-v9)
- **Contents:** D-029 R2 `_enforceAxisMarginFloor()` in `chart.js` (`PRICE_AXIS_MIN_R/L=60`, `MIN_B=24`); switch `__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX`; harness `H-A7b-R2` (multichart 2v, independent file25/27, anchored VP on B).
- **Proof:** `H-A7b-R2` 10/10 PASS (fix ON); `--axis-margin-floor-off` 10/10 FAIL-REAL-BUG; D-026 `H-R04`/`H-R05` ×10 PASS on b01. Closes **TAL-01665/01666/01667** (scale-strip leg).
- **Re-verify (PO):** 2v multichart → panel B different symbol → place anchored VP → price + time scales remain visible; build id `20260718b01`.
- **Watch:** H-R05 acceptance row still NOT green (CHROME-STAB-01) — D-026 re-run PASS does not promote H-R05 PO row.
- **Rollback:** `__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX`.

---

## CKPT-005 — 20260718b05 (A8 + A8-VP unified drawing checkpoint) — 2026-07-18
- **Build:** `20260718b05` (A8-1…4 + A8-VP-1/2 merged; host + iframe + dist-v9; not b44)
- **Contents:** Unified `drawing-tools-manager.js` (Worker 5 A8 tranches + Worker 1 A8-VP-1/2 on single base); A8-3 live cross-panel sync gate (`__harnessHostBridge` / harness mgr); commit `timestampPoints` on wire; receive applies explicit `timestampPoints` in `chart.js`; scope-integrity clean (388 methods, 0 dup defs).
- **Proof:** `H-A8-1…4` ×10 PASS; `H-A8-VP-1/VP-2` ×10 PASS; D-026 `H-R04`/`H-R05` ×10 PASS on b05.
- **Re-verify (PO):** `__TALARIA_CHART_BUILD_ID === 20260718b05`; 2-panel drawing sync ON → Shift+body drag on 1m host → 5m peer timestamp anchors match; anchored VP label/coord toggles in V9 settings.
- **Watch:** H-R05 PO acceptance row still CHROME-STAB-01 (harness 10/10 on b05 does not promote PO row); A8-VP iframe-detach flake class on isolate-session reruns.
- **Deploy (tester):** push + `./scripts/vps-deploy-after-pull.sh homepage`; hard-refresh host + panel-B iframe.
- **Rollback:** `__TALARIA_DISABLE_A8_*` per tranche; `__TALARIA_DISABLE_VP_V9_AV_LABEL_BRIDGE_FIX`; `__TALARIA_DISABLE_VP_V9_AV_COORD_REPOSITION_FIX`.
