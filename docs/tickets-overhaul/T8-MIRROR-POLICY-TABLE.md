# T8 Mirror Policy Table — CURRENT behavior extraction (read-only design doc)

**Track:** T8 (D-013 pulled forward)  
**Purpose:** Document the *shipped* adopt-data / adopt-X / adopt-Y decisions per matrix cell before any `__TALARIA_DISABLE_MIRROR_POLICY_V2` migration.  
**Constraint:** Zero behavior change — conflicts and PO-reported deviations are **escalations**, not silent corrections.

**Key files traced:** `panel-cmd-bridge.js`, `multichart-manager.js`, `replay-system.js`, `sync-bridge.js`, `chart.js` (both trees byte-identical under `homepage/public/chart/`).

---

## 1. A5 / TAL-01590 FIRST — independent-symbol × playing (P1 freeze)

### Mechanism trace (mandatory first input)

| Step | Location | Behavior |
|------|----------|----------|
| Host tick | `replay-system.js:5087–5095` | Host builds frame detail → `__multichartManagerBroadcastReplay(detail)` |
| Fan-out | `multichart-manager.js:1271–1287` | rAF-coalesced `sendCommandNoReply('replayFrame', payload)` to every iframe |
| Iframe entry | `panel-cmd-bridge.js:3160–3161` | `replayFrame` → `applyReplayFrame(ch, args)` |
| Passive tick block | `panel-cmd-bridge.js:3116–3118` | `replayTick` **dropped** when `pendingPlayDesired === true` during PLAY |
| Same-symbol branch | `panel-cmd-bridge.js:701–783` | BL-10 `scheduleCoalescedSeek` during `isPlaying` — **only** when `isSameSymbolAsHost(ch)` |
| Independent branch | `panel-cmd-bridge.js:826–840` | `applyMultichartMirrorFrame` + `renderFurthestLoadedMirrorFrame` + `scheduleMirrorCatchUp` (async) |
| Data source | `replay-system.js:6500–6689` | Independent uses `_panelFullRawData` when `_mirrorSharesHostDataset` is false |
| Catch-up breaker | `panel-cmd-bridge.js:1135–1143` | After 3 failed catch-ups → show furthest loaded only (**visible freeze**) for 2.5s+ |

**Root cause (policy gap):** There is **no** independent-symbol equivalent of BL-10 play-advance (`scheduleCoalescedSeek` during `isPlaying` for `!isSameSymbolAsHost`). Independent panels depend on mirror-frame timestamps + async `ensureReplayDataCoversTimestamp`; when fetch lags or the breaker trips, the panel **freezes at loaded edge** while the host continues.

### `{independent × playing}` policy cells (CURRENT)

| Sync (time / range / price) | adopt-data? | adopt-X? | adopt-Y? | Guard(s) |
|-----------------------------|-------------|----------|----------|----------|
| all OFF | **Partial** — adopt frame ts + mirror slice from `_panelFullRawData`; async fetch if ts > loaded edge | **No host mirror** — own master reslice via `applyMultichartMirrorFrame`; catch-up may lag | **Independent** — no host price copy (`BL-2b` default) | `panel-cmd-bridge.js:826–840`, `replay-system.js:6645–6646`, `chart.js:6297–6309` |
| time/range ON (symbol still independent) | Same partial — sync flags do not grant host `fullRawData` to different fileId | Follow host playhead **timestamp** only; X from own bars | Price still independent unless range-sync forces viewport coupling | `isSameSymbolAsHost` gate at `:701` |
| interval sync ON | N/A for different symbols in production (interval sync assumes same pair) | — | — | — |

**Harness note:** H-S59 **PASS** on contract path (`hostReplaySeek` + `replayFrame`); does **not** reproduce PO B-freeze on backtest 2-panel path. RED-variant (replayFrame-only) shows **host** frozen, B advancing — asymmetric fan-out, not PO symptom.

### RED scenario spec (production-faithful B-freeze — hand to Lane 4 / step 1)

**Proposed id:** `H-S59b` (or tighten H-S59 after Lane 4 baseline sync)

| Field | Spec |
|-------|------|
| Setup | 2v+ layout; **≥2 panels on distinct symbols** (extend `serve.mjs` beyond B=file27 only); sync all OFF; enter replay paused |
| Actuation | **Production-faithful play:** host `replayPlay` + tick-animation frames (`animatedCandle` + `tickProgress`) without synthetic-only `hostReplaySeek` in the inner loop; optional 3+ independent symbols |
| Measure (I15) | Per panel iframe: `replaySystem.replayTimestamp` advances every 2s wall-clock; `data[data.length-1].t` forming bar advances; **no panel frozen while others move** |
| RED | Any independent panel with `replayTs` delta = 0 over N play frames while host `replayTs` delta > 0 |
| Switch A/B | Proposed `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` — OFF = fix ON; ON = revert to current freeze-prone path |
| Evidence ticket | TAL-01590 |

---

## 2. Full matrix — TF relation × replay × sync

**Legend**

- **Y** = adopt / apply from host or mirror bus  
- **N** = keep panel-local / skip  
- **P** = partial / conditional (guard names the branch)  
- **—** = cell not reachable (e.g. independent + host data mirror)

Axes: **TF relation** {same, coarser, finer, independent} × **replay** {playing, paused, off} × **sync** {on, off} per axis (time/range/interval treated as a group where guards reference `_multichartVisibleRangeSyncOn`, `_mcIntervalSyncOn`, symbol sync).

### Same symbol + same TF

| Replay | Sync OFF | adopt-data | adopt-X | adopt-Y | Primary guard(s) |
|--------|----------|------------|---------|---------|------------------|
| off | — | N | N | N | No replay bus |
| paused | OFF | Y — clone host `data`/`rawData` on mirror frame | Y — mirror viewport on seek | P — price independent default (`BL-2b`) | `applyReplayFrame` same-pair mirror `:785–808`, `chart.js:3431` |
| paused | ON (time/range) | Y | Y | P | Idle dedup bypassed when `_multichartVisibleRangeSyncOn` (`:793–797`) |
| playing | OFF | Y — host batch mirror each frame | Y — BL-11 `maybePanelPlayViewportFollow` unless drag opt-out | P | `:701–808`, `:1665+` BL-11 |
| playing | ON | Y | Y (follow engaged unless user panned) | P | `:793–797`, D-038 drag-disengage |

### Same symbol + coarser panel TF

| Replay | Sync OFF | adopt-data | adopt-X | adopt-Y | Primary guard(s) |
|--------|----------|------------|---------|---------|------------------|
| paused | OFF | P — own coarse master; skip host reslice on host TF switch | P — BL-5 skip noop seek (`shouldSkipCoarsePanelHostSwitchSeek` `:1547`) | P | `:730–783`, `:1547–1578` |
| paused | OFF | P — BL-6 one-shot recenter if parked off-screen | Y if parked | N price reset on recenter | `maybeRecenterCoarsePanelAfterHostSwitch` `:1625–1662` |
| playing | OFF | P — advance on **own** coarse master (`BL-10` `:756–780`) | Y — play follow coalesced (BL-11/12/13) | P | `:756–780`, H-S17/H-S19 family |
| playing | ON | P — data still own master; timestamp shared | Y unless drag-disengage | P | `:779–780` sync-off peer isolation variant |

### Same symbol + finer panel TF (self-owner)

| Replay | Sync OFF | adopt-data | adopt-X | adopt-Y | Primary guard(s) |
|--------|----------|------------|---------|---------|------------------|
| paused | OFF | Y — finer self-own acquire (`BL-15`) or mirror-wait (`HOST_TF_MIRROR_WAIT`) | P — aligned seek guard BL-8 | P | `chart.js:21154+`, `panel-cmd-bridge.js:2401` |
| playing | OFF | P — own finer master | Y — `forceReplaySeek` + `maybePanelPlayViewportFollow` (`:735–754`, H-S27) | P | `:732–754` |
| playing | ON | P | Y | P | Finer owner play follow kill-switch `FINER_OWNER_PLAY_VIEWPORT_FOLLOW` |

### Independent symbol (different fileId)

| Replay | Sync OFF | adopt-data | adopt-X | adopt-Y | Primary guard(s) |
|--------|----------|------------|---------|---------|------------------|
| off | — | N | N | N | Independent pair load (`chart.js:4921–4932`) |
| paused | OFF | P — `_panelFullRawData` + mirror frame at ts | P — local seek; BL-8 may skip aligned tick | Y — independent price | `:826–840`, `!isSameSymbolAsHost` at `:701` |
| paused | ON | P | P | P | Symbol sync ON forces convergence (TAL-01586 / H-S53) — **not** independent |
| **playing** | OFF | **P — async catch-up; freeze risk** | **P — no BL-10 cell** | Y | **TAL-01590 escalation cell** — see §1 |
| playing | ON | P | P | P | Treat as synced same-symbol after convergence |

### Host TF switch (orthogonal overlay — applies across relations)

| Panel relation | Replay paused | adopt-data | adopt-X | adopt-Y | Guard(s) |
|----------------|---------------|------------|---------|---------|----------|
| same-TF held | paused | Y after settle — B-FIX-G resync | Y — B-FIX-F hold until host master covers playhead | P | `panel-cmd-bridge.js:584–620`, `chart.js:8400` |
| same-TF held | paused | Y — self-heal if playhead off-screen | Y — `syncReplayViewportToPlayhead` | Y reset price optional | `_mcScheduleSettledSelfHeal` `:500–546` |
| coarse same-pair | paused | N reslice storm — BL-5 skip | BL-6 recenter if parked | N on recenter | `:1547`, `:1625` |
| peers on fan-out | any | Y — wait for host commit | mirror after wait | P | `HOST_TF_MIRROR_WAIT` `:2401–2428` |

---

## 3. Intake evidence → cell map (2026-07-13)

| Ticket | Symptom | Matrix cell(s) | Current policy explains? | Notes |
|--------|---------|------------------|--------------------------|-------|
| TAL-01560 | Unexpected gaps on chart | independent×playing adopt-data **P**; coarse×playing data seam | **Partial** — catch-up lag / stale slice | Escalation if gaps persist after independent PLAY cell fix |
| TAL-01562 | Price gaps during manual replay | same/coarser×paused adopt-data **P** | **Partial** — resync/hold windows | Maps to B-FIX-F/G cells; H-S61/H-S62 |
| TAL-01563 | Replay advances in candle groups + mismatch | same-TF×playing adopt-X **Y** (BL-13 sub-pixel coalesce) | **Yes** — intentional cadence difference coarse vs host | PO may want smoother — policy documents, not bug |
| TAL-01573 | Manual rescale triggers full re-render | any×replay adopt-Y **P** | **Partial** — `calculateScales` invalidation scope (RC-2 flavor) | Not a mirror-frame guard; log as RC-2 cross-cut |
| TAL-01575 | Replay start shifts viewport | same×paused boot/replay-enter adopt-X **Y** | **Partial** — boot single-commit / replay-enter mirror (`H-S28–S31` family) | Cell: replay-off→paused transition |
| TAL-01577 | 1D/4H few candles; rescale gap | coarse×paused adopt-data **P** (BL-14/17 acquire) | **Partial** — acquisition seam | H-S20/H-S23 cells |
| TAL-01578 | Drag freeze — chart cannot be moved | playing×any adopt-X **N during drag** (D-038) | **Unknown** — if outside replay → T3 pan handler | BL-16 / H-S78 cell |
| TAL-01579 | Snap back to grab point on release | playing×drag adopt-X conflict | **Gap** — index-pin vs drag delta | Boot-shake / prepend compensation family; H-S73 |
| TAL-01590 | Independent symbol freeze during play | **independent×playing** | **No — policy gap** | **D-013 ruling-3 escalation** |

---

## 4. Escalation candidates (D-013 ruling 3)

| Cell | Issue | Evidence | Recommended action |
|------|-------|----------|-------------------|
| **independent × playing × adopt-data** | No BL-10 equivalent; async catch-up + breaker → freeze/gaps | TAL-01590, A5 trace | Director approve independent PLAY advance cell before migration |
| **independent × playing × adopt-X** | Playhead ts may advance on bus while viewport/data frozen | TAL-01590 | Same fix lane as above |
| **playing × drag × adopt-X** | BL-16: follow may re-engage mid-drag (lead hypothesis) | TAL-01578, A9 | Diagnostic-first per D-043; H-S78 pins contract |
| **paused × host-switch × same-TF peer** | Guards B-FIX-F/G/H interact — race under rapid switch | TAL-01562 | Keep as multi-guard cell; consolidate in policy v2 |
| **any × rescale × adopt-Y** | Full-chart re-render on manual rescale | TAL-01573 | RC-2 cross-cut — not mirror-policy alone |
| **release snap-back × adopt-X** | Index pin fights drag release delta | TAL-01579 | Escalate — may need prepend compensation policy (H-S73) |

### Cells needing Director approval (unknown / conflict)

1. **Independent × playing** — correct policy likely **Y adopt-data + Y adopt-X on own master** (mirror BL-10), but shipped = **P/N** → **must not migrate silently**.  
2. **Coarse × playing × sync-ON** — peer isolation (`SYNCOFF_PEER_PLAY_HOST_TF_ISOLATION`) vs range-sync follow — guards can disagree when range sync ON + host TF changed.  
3. **BL-16 cause split** — (a) X-viewport follow vs (b) Y autoscale refit — classify per confirmed mechanism before single fix.

---

## 5. Harness coverage cross-reference (T8 step 1)

Pending rows (`t8PendingScenarioList`, not in gate baseline): **H-S59–H-S78** — one scenario per previously ungated kill-switch + BL-16. Lane 4 must add to `known-failing.json` `expectedTests` when promoting to gate.

| Switch | Scenario |
|--------|----------|
| (independent play — proposed) | H-S59 / H-S59b spec |
| `PANEL_SETTLED_SELFHEAL` | H-S60 |
| `PANEL_MIRROR_UNSETTLED_HOST` | H-S61 |
| `PANEL_SETTLED_RESYNC` | H-S62 |
| `HOST_HISTORY_GROWTH_MIRROR` | H-S63 |
| `HOST_TF_MIRROR_WAIT` | H-S64 |
| `COARSE_PANEL_HOSTSWITCH_SEEK` | H-S65 |
| `PANEL_PRICE_INDEPENDENCE` | H-S66 |
| `PAUSED_REPLAY_ALIGNED_SEEK_GUARD` | H-S67 |
| `COARSE_PANEL_HOSTSWITCH_VIEWPORT_RECENTER` | H-S68 |
| `DISPLAY_TF_MASTER` | H-S69 |
| `HIGH_LIMIT_BULK` | H-S70 |
| `TF_SWITCH_FILL_STORM_GUARD` | H-S71 |
| `PANEL_HOSTSWITCH_QUIET` | H-S72 |
| `MIRROR_PREPEND_COMPENSATION` | H-S73 |
| `FINER_PANEL_SELFOWN` | H-S74 |
| `SAME_PAIR_PAN_HOST_OWNER` | H-S75 |
| `REPLAY_FOLLOW_FALLBACK` | H-S76 |
| `PANEL_MASTER_GROWTH_OFFSET` | H-S77 |
| BL-16 drag-during-play | H-S78 |

---

## 6. Migration note (out of scope for this doc)

Implementation lands behind `__TALARIA_DISABLE_MIRROR_POLICY_V2` only **after** Director approves this table. Superseded guards retire only when their scenario passes through the policy path unchanged (I9 gate).
