# T8 step 6 — main-chart replay refresh-persistence diagnostic (PLAN2-FOUND#5)

## 1. Task + RC

- **Task:** `T8-step6-lane2-replay-refresh-persistence-diagnostic.md` — READ-ONLY mechanism trace for PO staging on **`20260715a3`**: host/main-chart replay jumps after refresh, TF-switch drift/hide during replay, playhead not restored after reload.
- **RC:** **Tooling/diagnostic — no RC discharged.** Verdict: **boot/persistence gap** on the host session-restore path (primary). RC-3 (TAL-01575 viewport anchoring) and RC-8 are **secondary/downstream** on refresh only — not the D-015 panel-bridge path.

---

## 2. What I changed — file by file

**No files touched.** READ-ONLY diagnostic per guardrails. `react-parity-lib.mjs` unchanged.

---

## 3. Kill-switch (I3 + I13)

N/A — diagnostic only, no product edits.

---

## 4. Proof — RED → GREEN

### Step 0 — Regression vs pre-existing (mandatory)

| Check | Result |
|-------|--------|
| **PO symptom scope** | **Strictly refresh-triggered** — fresh session never shows jump/TF-hide (PO confirmed 2026-07-15). Rules out host tick-cadence bug as primary. |
| **a3 commit scope (`4bb97a0b`)** | `panel-cmd-bridge.js` H-S20 coarse-path fix + build id `20260715a3` + worker report only. |
| **D-015 window (`328b426e`…`4bb97a0b`)** | `git diff 328b426e..4bb97a0b --name-only` → **only** `panel-cmd-bridge.js`. |
| **`chart.js` / `replay-system.js` in a3/D-015 window** | **Zero diff** between D-015 landing and a3 for host replay persistence paths. |
| **Harness replay-refresh scenario** | **None dedicated** — H-S51 covers `chart_panel_state` **layout** only, not replay playhead. **H-S28** is the closest harness RED for viewport drift on boot (see below). |

**Verdict: PRE-EXISTING — not a3-introduced, not D-015-introduced.**

PO reported on a3 because that is the current staging cut; code evidence shows the host persistence/restore machinery was **not modified** by step 5, step 5b, or the a3 build bump. D-015 touched **iframe `panel-cmd-bridge.js` only** — consistent with PO observing symptoms on the **host/main chart** while panel edge-park was being validated.

**Urgency for D-015 acceptance:** Does **not** block D-015 fence/PO edge-park sign-off (separate surface). **Does** block trusting replay on staging until persistence fix lands — escalation candidate for session-restore behavior.

**Pre-D-015 live repro:** Not run in this cycle (no pre-a2 staging deploy in harness). Code-path isolation is the acceptance evidence for step 0; PO should spot-check one pre-D-015 build if Manager wants live confirmation.

---

### Persistence save/restore map

#### What is persisted (replay playhead)

| Store | Key / API | Fields | Writer | Reader |
|-------|-----------|--------|--------|--------|
| **Local backup** | `userStorage`: `talaria_bt_sess_v1_${sessionId}` (`chart.js:9921`) | `replay.replayTimestamp`, `currentIndex`, `tickElapsedMs`, `speed`, `playbackMode`, `timeframe`, `isActive` (`:10287–10297`) | `_writeTradingSessionLocalBackup` — throttled **20s while playing** (`:819`, `:10206–10217`); **force** on `pagehide` / `visibilitychange` (`:11474–11501`) | `_readTradingSessionLocalBackup` → `_getSavedReplayRestoreState` (`:10331–10351`) |
| **Server session state** | `GET/PATCH /api/sessions/${sessionId}/state` | `state.replay` (same shape) | `scheduleReplaySessionStateSave` — throttled **8s while playing** (`replay-system.js:4720–4733`, `chart.js:11142–11159`); `pagehide` keepalive flush (`:11494`) | `loadTradingSessionStateIfNeeded` → `applyPersistedState` (`:10673–10700`) |
| **In-memory pending** | `chart._pendingReplayRestore` | `replayTimestamp` (+ TF/speed) | Set at backtest boot from **sync** local read (`:1986–2003`) | `enterReplayMode({ preservePlayhead, initialReplayTimestamp })` (`:9795–9802`) |
| **In-memory pending (late)** | `chart._pendingReplayState` | Full `state.replay` blob | Set when session hydrate completes (`:10426–10427`, `:10674`) | `replay-system.applyPersistedState` (`replay-system.js:163–243`, `:2571–2576`) |

#### What is **not** replay playhead persistence

| Store | Contents | Note |
|-------|----------|------|
| **`chart_panel_state`** | Multichart **layout** id only (H-S51 / TAL-01571) | Does **not** carry `replayTimestamp`. |
| **`backtestingSession`** (userStorage) | Session date range | Anchors fetch window, not playhead. |
| **`talaria_bt_last_tf_${sessionId}`** | Last display TF | TF restore only (`:9925–9956`). |
| **URL / viewport** | No replay ts in query string | Playhead is **not** re-derived from URL; it comes from session backup or defaults to **session-start index** when missing (`replay-system.js:2531–2550`). |

#### Save on unload (refresh)

`initReplaySystem` registers `pagehide` + `visibilitychange` (`chart.js:11498–11501`):

1. Merge live `replaySystem._buildReplaySessionPatch()` into `_pendingSessionStatePatch` (`:11474–11480`).
2. `_flushReplayDashboardCoverageNow()` (`:10995–11007`).
3. `flushSessionStateSave({ keepalive: true })` — intended to survive tab tear-down (`:11491–11494`).

During play, `replay-system._persistReplayStateThrottled()` also patches every **8s** (`replay-system.js:4703`, `:4720–4733`).

#### Restore on boot (refresh) — host backtest path

```
getActiveTradingSessionId()                    chart.js:9840–9851
  → _getSavedReplayRestoreState(sessionId)     :10331 (sync local backup)
  → _pendingReplayRestore                      :1986–2003
  → _fetchReplaySeekBuffer(fileId, …, savedReplayTs)  :2008–2015, :7070–7117
       (OHLC window anchored on saved playhead, or session start if null)
  → queueMicrotask:
       enterReplayMode({ preservePlayhead, initialReplayTimestamp })  :9799–9802
       syncReplayViewportToPlayhead()                                 :9807–9811
       loadTradingSessionStateIfNeeded()   ← ASYNC, NOT AWAITED       :9813
       _pendingReplayRestore = null                                     :9818
```

When `loadTradingSessionStateIfNeeded` completes (`:10527+`), it may call `replaySystem.applyPersistedState(state.replay)` **again** (`:10683–10685`) and `syncReplayViewportToPlayhead` (`:10686–10694`).

`chartView.offsetX` restore is **suppressed** when `state.replay` exists (`:10710–10714`) — horizontal pan is replay-owned; stale playhead ⇒ wrong auto-scroll anchor.

---

### H-S28 strong lead (T0 step 15 baseline) — partial overlap, not same root

Lane 4 baselined **H-S28** as known-failing: `reanchorPasses=0`, **~612px drift** (`known-failing.json`). Read per updated prompt.

#### What H-S28 actually tests

| Aspect | H-S28 (`scenarios.mjs:3948–4084`) | PLAN2-FOUND#5 PO repro |
|--------|-----------------------------------|------------------------|
| **Trigger** | Host cell resize **single→multi** during multichart **boot** (`_multichartSkipResizeOffsetAdjust` frozen) | **Page refresh** after advancing replay playhead |
| **Asset** | `offsetX` viewport pin at new half-width | `replayTimestamp` / session playhead |
| **Replay** | **Not in replay mode** — static chart data | **Active backtest/trading-session replay** |
| **Persistence** | None — synthetic in-page resize probe | `talaria_bt_sess_v1_${sessionId}` + server `state.replay` |
| **Assertion** | `|firstPaintOffsetX − rightAnchorTarget| < 1px`; `reanchorPasses === 1` | Footer time jumps to refresh-point on Play |

**Conclusion:** H-S28 is **not** the harness reproduction of the playhead-date jump. It **is** a **related co-factor** for the **“content hides off-screen”** symptom when refresh reloads a **multichart layout** (H-S51 `chart_panel_state` hydrate → host cell width change → same §6cq boot-resize class as H-S28).

#### H-S28 mechanism + code path

1. MultichartGrid sets `_multichartSkipResizeOffsetAdjust = true` until boot settles.
2. `chart.resize()` with frozen flag **skips** normal right-edge nudge (`chart.js:17177`).
3. Intended fix: capture pre-resize right bar index (`_mcBootHostRightIdx`, `:17089–17102`) and index-pin on first paint (`:17221–17241`, kill-switch `__TALARIA_MC_DISABLE_BOOT_HOST_REANCHOR`).
4. **Harness RED today** (isolated run, this cycle):

```text
npm run test -- --only=H-S28
→ drift=612.0px, reanchorPasses=0, fixDisabled=false → FAIL-REAL-BUG
```

Fix code exists at `:17080–17241` but **does not actuate** in the harness probe (capture gating or branch miss — `_mcBootHostRightIdx` likely null at resize entry). Same ~612px magnitude PO would feel as “chart drifted/hidden” after reload into multichart.

#### Overlap with H-S6 / H-S27 / H-S30 (step 15 baselined)

| Row | Overlap with PLAN2-FOUND#5 | Note |
|-----|---------------------------|------|
| **H-S6** | **None** — TF fan-out owner-fetch (RC-8 BL-18); all panels self-fetch on 1m→1h | Refresh persistence unrelated. Baselined `known-failing.json`. |
| **H-S27** | **None** — finer-self-owner **panel** viewport freeze during play (`panel-cmd-bridge.js:685` family) | Host persistence path untouched. Baselined. |
| **H-S30** | **None** — host step-forward-spam refetch during **paused** replay | Step 5b isolated **3/3 PASS**; baselined for gate drift, not this PO repro. |

#### H-S28 vs persistence — fix tracks

| Track | Scope | Addresses |
|-------|-------|-----------|
| **A — Session persistence** (primary) | `chart.js` restore ordering + `replay-system.js` `applyPersistedState` | Play jumps to refresh-point; catch-up candle leap |
| **B — Boot host reanchor** (H-S28 / §6cq) | `chart.js:17080–17241` | Viewport hide/drift on multichart boot after refresh; may **compound** symptom 3 with wrong playhead |

Recommend **Track A first** (PO key repro is playhead date). **Track B** in same refresh UX bundle if PO confirms multichart layout on reload.

---

### Symptom 1 — Play after refresh jumps to “refresh-point” date

**Mechanism (ranked):**

1. **Async server hydrate overwrites / races sync local restore** (`chart.js:9813` without `await`). Boot uses **sync local** `_getSavedReplayRestoreState` for fetch + `enterReplayMode`. Later, server `state.replay` may be **older** (8s PATCH throttle) or **missing `replayTimestamp`** if keepalive failed — `applyPersistedState` then re-anchors to bar index / session floor, not the pre-refresh wall-clock playhead.

2. **`enterReplayMode` does not apply `_pendingReplayRestore` via `applyPersistedState`.** It only passes `initialReplayTimestamp` into index selection (`replay-system.js:2507–2530`), then **overwrites** `replayTimestamp` and clears `tickElapsedMs` (`:2566–2567`) **before** `_pendingReplayState` apply (`:2571–2576`). On first paint `_pendingReplayState` is often still **null** (hydrate not done) → fractional playhead + tick progress discarded.

3. **Missing `sessionId`** → `_getSavedReplayRestoreState` returns null → `preservePlayhead: false` → backtest starts at **session-start index** (`replay-system.js:2531–2550`). PO “refresh-point” wording fits **last successful persist** (unload snapshot) rather than true advanced playhead.

**Not primary:** Host tick cadence bug — ruled out by PO fresh-session control.

---

### Symptom 2 — “Jumps many candles after a bit” (after refresh)

**Mechanism:** Downstream **catch-up reconcile**, not cadence.

After wrong/stale restore, `replayTimestamp` and `currentIndex` disagree with the loaded master window. On **Play**, the tick loop advances wall-clock `replayTimestamp` while `updateChartData` / `syncCurrentIndexFromReplayTimestamp` / `_clampCurrentIndexToReplayTimestamp` (`replay-system.js:150–161`) snap `currentIndex` forward — visible as a **multi-candle leap**. This matches PO’s model: wrong restored anchor + catch-up on play.

**Not** `panel-cmd-bridge` coalesced seek (host path). **Not** D-015 edge-park.

---

### Symptom 3 — TF switch during replay drifts / hides content (after refresh)

**Mechanism:** Viewport anchor lost because playhead is wrong or outside the TF-refetch window — **plus possible H-S28 boot-reanchor co-factor** on multichart refresh.

- TF hot-swap preserves `savedReplayTimestamp` and calls `applyPersistedState` + `syncReplayViewportToPlayhead` (`chart.js:8495–8534`, `:8585+`).
- If restored `savedReplayTimestamp` is stale, `getReplayAutoScrollState` / `syncReplayViewportToPlayhead` (`replay-system.js:2906–2956`) compute `offsetX` for the **wrong** index → candles off-screen (“hides”).
- **H-S28 co-factor:** refresh → `chart_panel_state` layout hydrate → host single→multi resize → **612px offset drift** if boot reanchor does not fire (same §6cq path as H-S28 RED).
- **TAL-01575 overlap:** replay-start viewport shift family — manifests here because refresh restore already mis-anchored X before TF switch.
- **Refresh-safety loop** documents the same class: `loadTradingSessionStateIfNeeded` can overwrite `offsetX` **after** `enterReplayMode` alignment (`replay-system.js:2607–2612`, `:2614–2638`).

**Secondary to persistence gap** — TF switch on a **fresh** session is OK per PO. H-S28 explains **viewport-only** hide on refresh without wrong playhead if PO sees drift before Play.

---

### Single root vs three issues

| # | Symptom | Root relationship |
|---|---------|-------------------|
| 1 | Play jumps to refresh-point | **Primary** — save/restore playhead gap |
| 2 | Multi-candle jump on play | **Downstream** — index/ts reconcile |
| 3 | TF-switch drift/hide | **Downstream** — wrong playhead → bad offsetX; **+ H-S28** on multichart refresh boot |

**One scoped persistence/restore fix (Track A)** should collapse symptoms 1–2 and most of symptom 3 on refresh. **Track B (H-S28 boot reanchor)** may still be needed for viewport hide when multichart layout hydrates after reload. TF anchoring hardening (T5) may still help edge cases after playhead restore is correct.

---

### RC / track / fix recommendation

| Item | Verdict |
|------|---------|
| **Primary RC** | **Boot/persistence gap** — host `chart.js` + `replay-system.js` session restore ordering (not RC-8 mirror-frame; not D-015). |
| **Secondary** | RC-3 / **TAL-01575** viewport anchoring; **§6cq boot host reanchor (H-S28)** for multichart refresh viewport hide. |
| **Fix owner track** | **Track A:** new persistence task (host engine). **Track B:** H-S28 boot reanchor fix in `chart.js:17080+` (can ship in same refresh bundle). **Not** T8 `panel-cmd-bridge.js`. |
| **Escalation candidate** | **Yes** — changing server-vs-local restore precedence and unload flush semantics is shipped behavior; Manager sign-off before implementation. |
| **Kill-switch** | Recommend gated restore merge (`__TALARIA_*`) when fix lands — not designed this cycle (read-only). |

**Proposed fix direction (diagnostic only):**

1. `await loadTradingSessionStateIfNeeded()` **before** `enterReplayMode`, or merge local+server replay with **max(`replayTimestamp`)** / freshest `savedAt`.
2. Feed `_pendingReplayRestore` into `applyPersistedState` inside `enterReplayMode` (not only `initialReplayTimestamp` index math).
3. Remove or guard the `:2566–2567` overwrite when `preservePlayhead` already set fractional ts + `tickElapsedMs`.
4. Add harness scenario: seed `talaria_bt_sess_v1_*` with advanced `replayTimestamp`, reload host, assert playhead + play advance without multi-bar leap.
5. **Track B:** debug why H-S28 RED with `fixDisabled=false` (`_mcBootHostRightIdx` capture at `chart.js:17091`) — use as RED gate for boot reanchor on refresh/multichart boot.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| READ-ONLY / no product edits | Satisfied |
| I8 / panel bridge | N/A — host path only |
| I15 | No proxy greens claimed |
| Freeze-exempt replay path | Diagnostic only; no guard #21 |
| Step 0 regression gate | Satisfied via git scope + PO fresh-session control |

---

## 6. What I did NOT do / limits

- Did **not** run PO live repro on pre-D-015 staging build (code isolation only for step 0).
- Did **not** add harness replay-refresh scenario (read-only guardrail); used existing **H-S28** RED as boot-viewport evidence only.
- Did **not** trace journal/order restore interaction beyond `_expectsReplayPlayheadRestore` flag.
- Did **not** confirm whether PO session always has `sessionId` in URL/storage (if missing, persistence is a no-op — worth PO confirming).
- Assumed PO defect is **backtest/trading-session replay on host** (symptom text + persistence machinery); non-session replay button path uses `enterReplayMode` 10% default (`replay-system.js:2552–2554`) — separate but same overwrite pattern.

---

## 7. Live-verification handoff

**For PO (confirm diagnostic, not fix):**

1. Build **`20260715a3`** — host chart (not panel iframe).
2. Open trading/backtest session with `sessionId` visible in URL or storage.
3. Advance replay well forward; note footer timestamp.
4. **Hard refresh** (F5).
5. Before Play: note whether footer timestamp matches pre-refresh (RED if it shows refresh-time / session-start).
6. Press Play: note multi-candle jump (symptom 2).
7. Switch TF during replay: note viewport drift/off-screen (symptom 3).
8. **Control:** repeat steps 3–7 **without refresh** — should stay GREEN (PO already confirmed).

**DevTools spot-check on refresh:**

```javascript
// session backup
JSON.parse(localStorage.getItem('talaria_bt_sess_v1_' + sessionId))?.replay
// live playhead
window.chart?.replaySystem?.replayTimestamp
```

Compare backup `replayTimestamp` vs live after boot — mismatch confirms restore gap.

---

## 8. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)**

Step 0 verdict: **PRE-EXISTING** (not a3/D-015). Single host persistence/restore gap likely root; candle-jump and TF-hide are downstream on refresh. Fix belongs to a **new host persistence task**, not T8 panel bridge — escalate before changing restore precedence.

---

## Manager summary

```
PO PLAN2-FOUND#5 on a3 (host chart, refresh-only)
  │
  ├─ Step 0: PRE-EXISTING (a3/D-015 touched panel-cmd-bridge only)
  │
  ├─ Track A (primary): session replay playhead persistence gap
  │     • talaria_bt_sess_v1_${sessionId} + /api/sessions/.../state
  │     • async loadTradingSessionState races enterReplayMode
  │     • _pendingReplayRestore not applied via applyPersistedState
  │     → PO playhead-date jump + catch-up candle leap
  │
  ├─ Track B (co-factor): H-S28 boot host reanchor (§6cq)
  │     • Harness RED: reanchorPasses=0, drift≈612px (chart.js:17080+)
  │     • Multichart layout hydrate on refresh → viewport hide
  │     → NOT the playhead-date jump; compounds symptom 3
  │
  ├─ H-S6/H-S27/H-S30: no overlap (baselined, different defects)
  │
  ├─ Symptom 2 (candle jump): catch-up reconcile — downstream of Track A
  └─ Symptom 3 (TF hide): Track A + Track B + TAL-01575

D-015 acceptance: NOT blocked (separate surface)
Replay staging trust: BLOCKED until Track A (+ Track B if multichart refresh)
```
