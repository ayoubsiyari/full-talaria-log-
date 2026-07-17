# ORD-MULTICHART-PARITY — multichart 2-panel / 2-ticker order parity diagnostic (Lane 3)

## 1. Task + RC

- **Task:** ORD-MULTICHART-PARITY diagnostic (read-only) — panel B lockout + dual-replay PnL stall on independent 2-ticker multichart.
- **RC:** RC-5 / **A6-4 host-canonical order store** (primary architecture gap); secondary freeze-safe contributors below. **DIAGNOSTIC-ONLY — no RC discharged, no product code changes.**

---

## 2. What I changed — file by file

**N/A — diagnostic only.** No product/engine/harness/React edits.

**Read paths:** `MultichartGrid.jsx`, `panel-cmd-bridge.js`, `order-manager.js`, `order-service.js`, `order-interaction-guard.mjs`, `order-runtime-persist.mjs`, `TalariaV8bLive.jsx`, `orderManagerTradeRows.js`, harness `serve.mjs` / `scenarios.mjs` (H-S36 order-fill anchor only — not lockout/PnL).

---

## 3. Kill-switch (I3 + I13)

**N/A for this diagnostic.** Proposed interim switches for a future fix are listed in §8 below (not implemented).

Existing related switches (context only):

| Switch | Default | Relevance |
|--------|---------|-----------|
| `__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX` | unset = A6-1 ON | Stuck provisional drag on panel B could block entry if release never fires |
| `__TALARIA_DISABLE_ORDER_PERSISTENCE_V1` | unset = persist ON | Shared session key can bleed orders across panels on F5 |

---

## 4. Proof — RED → GREEN

### Reproduction recipe (PO / dev:live / built embed)

**Surface:** real multichart embed — `npm run build:live` (or docker homepage) → layout **2v** (`mcLayout=2v`), **different tickers** on A vs B (independent pair).

| Step | Action |
|------|--------|
| 1 | Open chart with session; split to 2 panels; set panel B to a **different symbol** (file25 vs file27 pattern). |
| 2 | Enter replay on host; confirm both tiles show replay chrome active. |
| 3 | Click panel B to focus (blue focus frame); place order on B via rail Execute. Repeat 5–10× with focus swaps A↔B. |
| 4 | With open positions on **both** panels, press Play on both (shared wall-clock replay). Watch **on-chart PnL labels** and **bottom trades rail** for 30+ seconds. |
| 5 | Optional stress: split 1→2 **mid-replay** (paused), or drag open SL on B then try new entry on B. |

**Harness analogue (partial, not acceptance):**

```text
cd "chart v 1.4/chart/multichart-prod/harness"
npm run serve
# http://127.0.0.1:8791/harness/host.html?pair=independent&panels=2&tf=1m
```

Harness covers replay cadence for independent panels (H-S59/H-S59b playhead advance) but **does not** place per-panel orders or assert PnL label refresh — order scenarios stop at H-S36 (same-pair fill anchor).

### I15 actuation / measurement (this session)

| Claim | Actuation | Measurement | Status |
|-------|-----------|-------------|--------|
| Panel B lockout | **Not run** — no real mouse Execute on focused iframe B in built product this session | — | **NOT PROVEN** |
| Dual-replay PnL stall | **Not run** — no live dual-replay PnL sampling | — | **NOT PROVEN** |
| Mechanism / root-cause ranking | Static code trace + contract docs (`T4-A6-ORDER-INTERACTION-CONTRACT.md`, ESC-017) | File:line evidence below | **DIAGNOSTIC ONLY** |

**Honest statement:** PO symptoms are **plausible and predicted by code**; this report does **not** claim live RED/GREEN. Status is **DIAGNOSTIC-ONLY**.

---

## 5. Ranked root causes

### Symptom A — intermittent “can’t add order on panel B” (entry no-op / blocked)

| Rank | Root cause | Symptom link | Evidence |
|------|------------|--------------|----------|
| **1** | **Iframe replay not active when `placeOrder` runs** | Execute on focused B fails silently (MultichartGrid catches + warns) or throws `iframe replay not active` | `panel-cmd-bridge.js` ~3478–3479: `if (!ch.replaySystem \|\| !ch.replaySystem.isActive) throw …`; `MultichartGrid.jsx` ~3770–3807 re-primes `replayEnter` on `readyPanels` but race if user clicks Execute before drain; `applyReplayEnter` defers when `rawData` empty (~2142–2146) |
| **2** | **Focus / command routing to wrong tile** | Order lands on A or nowhere; B appears “dead” | `MultichartGrid.jsx` ~6685–6718: capture-phase `#placeOrderButton` routes to `focusedPanelIdRef`; stale focus after iframe click if `multichartFocusChanged` missed |
| **3** | **Stuck A6-1 provisional / draft-drag busy** | Pointer-up lost → guard thinks drag still active; entry/preview swallowed | `order-manager.js` ~587 `_oiIsProvisionalEditActive`, ~722–727 cancel on replay-stop only; `TalariaV8bLive.jsx` ~17447 skips `setDraftPreview` when `multichartDraftDragBusyRef` true (~23545–23549) — no watchdog if `busy:false` never arrives |
| **4** | **Shared session-scoped order persist key (A6-2)** | Intermittent after F5 or rapid panel init — wrong panel’s orders hydrate | `order-manager.js` ~12–21: `chart_orders_runtime_session_v1:${sessionId}` — **not panel-scoped**; both host + iframe share session id |
| **5** | **A6-4 clone model (secondary for lockout)** | Cross-panel mirror adds duplicate ids / suppressEmit races | `panel-cmd-bridge.js` ~973–1010 forwarders; `addOrder` suppressEmitId loop guard (~3514–3518) |

**Lockout vs PnL:** **Different primary roots.** Lockout = **replay-enter race + focus routing + interaction guard** (ranks 1–3). PnL stall = **host-only subscribers + background mark path** (symptom B).

### Symptom B — PnL stuck when replay runs on both panels

| Rank | Root cause | Symptom link | Evidence |
|------|------------|--------------|----------|
| **1** | **Parent trades rail reads host `orderManager` only** | B’s open PnL frozen in bottom panel / HUD while on-chart B labels may still move | `TalariaV8bLive.jsx` ~11981–11998: `window.chart?.orderManager` eventBus + 800ms poll — **never reads iframe OM** |
| **2** | **Per-iframe order clones (A6-4) — no `order:opened-updated` fan-out** | Edits/drag on B don’t propagate; host rail shows stale totals | `MultichartGrid.jsx` ~6471–6495: fans `order:opened`, `pending`, `pending-updated`, `closed` — **no opened-updated**; `T4-A6-ORDER-INTERACTION-CONTRACT.md` A6-4 row |
| **3** | **Background mark series for foreign ticker relies on lazy `_miSeriesByFileId` fetch** | On-chart PnL on A for B’s instrument sticks at `_miLastMarkPrice` until fetch completes | `order-manager.js` ~1782–1827 `_getBackgroundBarForTicker`; ~27962–27970 background branch in `updatePositions`; `_markFromPanelDataLastClose` ~2178–2194 uses **`window.panelManager`** — **absent in MultichartGrid iframe embed** (`_isMultiPanelLayout` ~1176–1178 returns false for multichart) |
| **4** | **Independent replay playhead coupling** | B replay ts frozen → `updatePositions` never advances mark | Mitigated by H-S59/H-S59b fixes (`scheduleCoalescedSeek`); still worth checking if PO build predates fix or sync toggles differ |
| **5** | **Host-canonical gap (architecture)** | Any cross-panel PnL/account aggregation wrong | ESC-017 / D-020: host-canonical store ratified, dispatch post-re-migration |

### Is this A6-4 or something smaller?

- **Cross-panel SL/TP drift, mirror stale state, rail PnL:** **Yes — A6-4 host-canonical is the true fix** (post-unfreeze; touches `MultichartGrid.jsx` + `panel-cmd-bridge.js`).
- **Intermittent B lockout:** **Mostly smaller, freeze-safe** — replay-enter readiness on iframe B + focus routing + provisional-drag cleanup. Session persist scoping is a separate A6-2 follow-on.
- **On-chart PnL on the focused iframe for its own ticker:** should work via local `updatePositions` → `updateOrderLines` if replay is active; if PO sees on-chart freeze too, suspect rank B3 (background fetch) or B4 (replay not ticking on B).

### Intermittency trigger (best hypothesis)

1. User focuses B and hits Execute **before** `replayEnter` drains on B (`readyPanels` effect ~3771–3804, or deferred `pendingReplayTs` in bridge).
2. Less often: SL/TP drag on B ends with lost pointer-up → provisional guard or `multichartDraftDragBusy` stuck.
3. PnL “stuck” often = user watching **host rail** while orders live in **iframe B OM** (rank B1) — not a replay tick failure.

---

## 6. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | No edits |
| I15 | No proxy greens; live repro explicitly not performed |
| Freeze | No `chart.js`, `replay-system.js`, MultichartGrid, or panel-cmd-bridge edits |
| Lane 3 read-only | STOP after report |

---

## 7. What I did NOT do / limits

- Did **not** run live 2-ticker multichart repro in browser (built product or dev:live) — **NEEDS-LIVE**.
- Did **not** capture console for `iframe placeOrder failed` / `iframe replay not active`.
- Did **not** bisect guard switches on panel B lockout (A6-1 OFF prediction untested live).
- Harness H-S59/H-S36 pass history in repo does **not** cover order placement parity on independent pair.
- Did **not** evaluate same-ticker 2-panel (PO setup explicitly different tickers).

---

## 8. Proposed fix plan (switch-gated, not implemented)

### Freeze-safe interim (pre–A6-4)

| Knob | Scope | Behavior |
|------|-------|----------|
| **`__TALARIA_MC_ORDER_PERSIST_PANEL_SCOPE_V1`** (new) | `order-manager.js` persist read/write | Append `panelId` (or iframe id) to runtime storage key so F5/hydrate cannot collide across tiles. Default OFF until proven. |
| **`__TALARIA_MC_REPLAY_PNL_HOST_AGG_V1`** (new) | `TalariaV8bLive.jsx` + thin MultichartGrid hook | When multichart active, aggregate `order:update-tick` / open positions from **focused iframe** via `postMessage` probe or `runCommand('getOrderSnapshot')`. Default OFF. |
| **Guard cancel on focus loss** (no switch, small OM patch) | `order-manager.js` | On iframe `blur` / panel defocus, call `_oiCancelActiveProvisionalEdit('focus-loss')` + clear draft-drag busy — reduces stuck-entry without host-canonical rework. |
| **Replay-enter gate on Execute** (MultichartGrid) | UX not silent fail | Disable Execute or show toast until target iframe `replaySystem.isActive` (probe via existing `runCommand`). |

### Post-unfreeze (A6-4 — required for true parity)

- **One host-canonical `orderManager`**; panels render projections only.
- Fan-out **`order:opened-updated`** (and close/partial) mirroring existing `order:pending-updated` / `syncPendingOrder`.
- Do **not** patch opened-updated onto clone model (ESC-017 binding note).

---

## 9. Live-verification handoff

**Build for any future fix:** current branch after revert is **`20260717b4`** (marker pull); diagnostic applies to **`20260717b2`** behavior family.

**PO confirm lockout:**

1. 2v, different tickers, replay entered.
2. Focus B → Execute immediately after split (within ~1s) vs after 3s pause — note if fast path fails.
3. DevTools parent console: filter `MultichartGrid] iframe placeOrder failed`.
4. In panel B iframe: `chart.replaySystem.isActive` when Execute fails.

**PO confirm PnL:**

1. Open position on B only; play replay.
2. Compare **on-chart** PnL box on B vs **bottom trades rail** — if rail frozen but chart moves, rank B1 confirmed.
3. Open positions on both; play; check each panel’s **on-chart** labels independently.

---

## 10. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)**

Ranked causes are code-backed; live PO symptoms are **not proven** in this session (I15).
