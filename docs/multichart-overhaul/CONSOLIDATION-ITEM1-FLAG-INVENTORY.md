# Consolidation Item 1 — Kill-Switch Inventory + Single-Hold Policy + Cleanup Plan

**Status:** Analysis complete + partial EXECUTION DONE (build **b71**). Probes `[B10]`/`[EMPTYRENDER]`/
`[PANLOAD]` stripped (both trees, 0 matches); `[BL2B_PRICE]` kept intact for Item-2; build-id drift
reconciled (all `sw.js` = b71, stale `dist-v9/sw.js` b36→b71 fixed). **DEFERRED to a post-baseline
reviewed pass:** viewport-first dead-code removal (retire H flag too) — held until Item-2 baseline exists
to diff against (no regression harness yet). I4 hashes match on all edited engine files; node --check clean.
**Authority:** Director **D-026** ("FREEZE IS NOW ACTIVE"), consolidation Item 1.
**Build:** analysis on `20260707b70`; execution shipped `20260707b71`.
**I4:** both engine trees (`chart v 1.4/chart/…`, `homepage/public/chart/…`) byte-identical on all cited
flag read sites. Line citations use the deploy mirror `homepage/public/chart/…` (identical in the other tree).

---

## 1. Kill-switch inventory (~22 behavioral flags)

**Default convention:** `__TALARIA_MC_DISABLE_*` / `__TALARIA_DISABLE_*` → unset/`false` = fix ON (prod
default). `__TALARIA_MC_ENABLE_*` → must be explicitly `true` to engage.

| Flag | Fix / behavior gated | Code path | Default | Verdict |
|---|---|---|---|---|
| `__TALARIA_MC_DISABLE_MIRROR_PREPEND_COMPENSATION` | B-FIX-C panel offsetX comp on shared-master left-growth | chart.js:2387 `_mirrorPrependCompensationDisabled` | ON | load-bearing |
| `__TALARIA_MC_DISABLE_PANEL_MASTER_GROWTH_OFFSET` | B-FIX-C offsetX shift in updateChartData on prepend | replay-system.js:3035 updateChartData | ON | load-bearing |
| `__TALARIA_MC_DISABLE_REPLAY_FOLLOW_FALLBACK` | B-FIX-1 fallback offsetX restore | replay-system.js:6230 | ON | backstop |
| `__TALARIA_MC_DISABLE_PANEL_PRICE_INDEPENDENCE` | BL-2b skip host price copy + host-driven reset | chart.js:2994 `_multichartMirrorHostTfSwitchIfReady`; replay-system.js:2895/2863 | ON | load-bearing |
| `__TALARIA_MC_DISABLE_FINER_PANEL_SELFOWN` | B8 finer same-pair self-own | chart.js:3059 `_finerPanelSelfOwnDisabled` | ON | load-bearing |
| `__TALARIA_MC_DISABLE_DISPLAY_TF_MASTER` | B-FIX-6a idle host display-TF master | chart.js:4087 loadMultichartPanelFromHost | ON | load-bearing |
| `__TALARIA_MC_DISABLE_LAZY_REPLAY_MASTER` | B-FIX-6b lazy 1m hydration | chart.js:5713 `_lazyReplayMasterDisabled` | ON | load-bearing |
| `__TALARIA_MC_DISABLE_HIGH_LIMIT_BULK` | B-FIX-6c high-limit /smart bulk | chart.js:5802 `_highLimitBulkHistoryDisabled` | ON | load-bearing |
| `__TALARIA_DISABLE_BT_TF_CACHE_PLAYHEAD_COVER` | B-FIX-E cache playhead-coverage guard | chart.js:8373 | ON | load-bearing |
| `__TALARIA_MC_DISABLE_TF_SWITCH_FILL_STORM_GUARD` | B-FIX-D fill-storm plateau guard | chart.js:29743 `_fillViewportHistoryAfterTfSwitch` | ON | load-bearing |
| `__TALARIA_MC_DISABLE_PANEL_MIRROR_UNSETTLED_HOST` | **B-FIX-F** hold mirror while host playhead outside master | panel-cmd-bridge.js:528 applyReplayFrame | ON | load-bearing |
| `__TALARIA_MC_DISABLE_PANEL_SETTLED_RESYNC` | **B-FIX-G** one-shot re-mirror after settle | panel-cmd-bridge.js:582; chart.js:8094 | ON | load-bearing |
| `__TALARIA_MC_DISABLE_PANEL_MIRROR_CROSS_TF_HOST_SWITCH` | **B-FIX-H** hold on _switchingToTimeframe≠panelTf | panel-cmd-bridge.js:560 | ON | **RETIRE-CANDIDATE** (INERT, harmless) |
| `__TALARIA_MC_DISABLE_PANEL_SETTLED_SELFHEAL` | **B-FIX-I** debounced off-screen self-heal | panel-cmd-bridge.js:446 `_mcScheduleSettledSelfHeal` | ON | load-bearing |
| `__TALARIA_MC_DISABLE_PANEL_HOSTSWITCH_QUIET` | **B-FIX-J** suppress empty-recovery mid-switch | chart.js:17409 `_scheduleViewportEmptyRecovery` | ON | load-bearing |
| `__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_SEEK` | **BL-5** skip paused coarse-panel no-op seek | panel-cmd-bridge.js:1383 `shouldSkipCoarsePanelHostSwitchSeek` | ON | load-bearing |
| `__TALARIA_MC_DISABLE_SAMETF_REMIRROR` | 6a-2 re-mirror same-TF panel on extent change | panel-cmd-bridge.js:1822 setTimeframe | ON | load-bearing |
| `__TALARIA_MC_ENABLE_VIEWPORT_FIRST` | viewport-first switch (superseded D-016) | chart.js:4587/4802 | OFF | **RETIRE-CANDIDATE** (dead code) |
| `__TALARIA_MC_DISABLE_VIEWPORT_FIRST_SWITCH` | kill-switch for above (pair) | chart.js:4589/4626 | N/A | **RETIRE-CANDIDATE** |
| `__TALARIA_MC_DISABLE_VIEWPORT_FIRST_TF_SWITCH` | kill-switch for above (TF) | chart.js:4623/4803 | N/A | **RETIRE-CANDIDATE** |
| `__TALARIA_DISABLE_TF_REVEAL_HOLD` | embed TF-switch reveal hold | chart.js:21127 `_shouldHoldTfReveal` | ON | backstop |
| `__TALARIA_DISABLE_SHARED_BAR_STORE` | shared bar store opt-out | chart.js:2609 | ON | backstop |

**Tuning knobs (not kill-switches):** `__TALARIA_MC_LAZY_REPLAY_MASTER_LIMIT` (chart.js:5794, def 100000),
`__TALARIA_MC_HIGH_LIMIT_BULK_LIMIT` (chart.js:5814, def 100000).
**Grid flags:** `__TALARIA_CHART_BUILD_ID` (MultichartGrid.jsx:77 cache-bust), `__TALARIA_INPROC_PANELS`
(MultichartGrid.jsx:638, Phase-6 experiment, OFF).
**Un-flagged hold:** panel-cmd-bridge.js:516 hard hold while `_timeframeSwitching || _pairSwitchLoading`
(no kill-switch — always active).

---

## 2. Single-hold / price policy (proposed consolidation target — NO behavior change yet)

Layered gates on the `applyReplayFrame` / seek / recovery / price path:

- **Phase A — Hold (mirror ingress):** (1) hard hold `_timeframeSwitching||_pairSwitchLoading` (516, un-flagged);
  (2) **F** hold host-playhead-outside-master (528); ~~(3) **H** retire first (560)~~; release via **G** one-shot
  resync + host broadcast (582, chart.js:8094).
- **Phase B — Seek:** **BL-5** skip coarse no-op seek (1383/1429).
- **Phase C — Recovery backstops:** **J** no empty-recovery during host switch (17409); **I** debounced
  off-screen self-heal after quiet (446) for fast-switch races G can miss.
- **Phase D — Price (orthogonal):** **BL-2b** never copy host price state / never host-reset panel Y in
  stamped host-replay context (2994, 2863, 1422).

**Verdict:** keep **F + G + I + J + BL-5 + BL-2b** (each covers a unique path — see analysis). **H is the
sole retire candidate** (INERT for BL-2b; cross-TF corruption covered by F + cross-TF dedup + G on switch-back).

---

## 3. Cleanup disposition (recommend only)

| Item | Location | Recommendation |
|---|---|---|
| `[B10]` (`__TALARIA_MC_DEBUG_B10`) | chart.js:5568/22454/25294; replay-system.js:3098; sync-bridge.js:516/1665; multichart-manager.js:1054 | **Strip now** — drift thread closed. |
| `[BL2B_PRICE]` (`__TALARIA_BL2B_PRICE_PROBE`) | chart.js:2–50 install; marks panel-cmd-bridge.js:499/1427/1476, replay-system.js:6425, sync-bridge.js:2008; logs chart.js:2985/17431/23047, replay-system.js:2854, sync-bridge.js:860 | **KEEP gated until after Item-2 baseline** (needed for BL-2b isolation re-capture). |
| `_traceEmptyRenderDriver` / `[EMPTYRENDER]` | chart.js:28888/29013/29021 | **Strip now** (BL-5 closed). |
| `[PANLOAD]` | chart.js:22020 | **Strip now**. |
| Viewport-first dead code (D-016) | chart.js:825, 4190–4501, 4580–4797, 4800–4825+, 29634–29664 | **Remove** (inert; opt-in flag default OFF). Verify unreachable + node --check both copies. |

### Build-ID source of truth (b70) + drift
Atomic bump set: `bump-dist-v9-cache.mjs` → `live/index.html` (`__TALARIA_CHART_BUILD_ID`), both
`dist-v9/index.html`, all three `sw.js` (SW_VERSION), both `chart-embed.html` fallback. Separate:
`chart.js:431 CHART_ENGINE_BUILD='20260628b204'` (console-only engine id, NOT the cache-bust id).
- **b72 vs b70:** PO-side deployed label ≠ repo counter (probe b69 → fix b70); deploy-drift, not a code issue.
- **⚠ IN-REPO DRIFT FOUND:** `chart v 1.4/chart/dist-v9/sw.js` SW_VERSION still `20260706b36` while
  homepage mirror is `b70` — stale artifact if that tree is served. **Reconcile in Item-1 execution.**
- **Recommend:** CI check that all `sw.js` SW_VERSION === `__TALARIA_CHART_BUILD_ID`.
