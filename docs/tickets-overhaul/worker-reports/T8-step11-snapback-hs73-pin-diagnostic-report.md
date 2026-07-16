# T8 step 11 — TAL-01579 release snap-back: H-S73 pin + diagnostic report

## 1. Task + RC

- **Task:** `T8-step11-lane2-snapback-hs73-pin-diagnostic.md` — READ-ONLY pin fidelity check for **H-S73**, mechanism trace for **TAL-01579** (chart snaps back to grab point on drag-release during/near replay), prepend-compensation policy proposal.
- **RC:** **Tooling/diagnostic — no RC discharged.** Escalation-class per D-014 ruling 3 — policy change needs Director sign-off before fix.

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | **Spec-only comment block** above H-S73 clarifying it pins B-FIX-C prepend compensation, **not** TAL-01579 snap-back; points to proposed H-S79 pin. |
| `docs/tickets-overhaul/worker-reports/T8-step11-snapback-hs73-pin-diagnostic-report.md` | This report. |

**No product edits.** `react-parity-lib.mjs`, `panel-cmd-bridge.js`, `chart.js` — read-only trace.

**I8:** `homepage/public/chart/multichart-prod/harness/scenarios.mjs` should be synced when Manager accepts the comment-only harness touch (comment block only; no logic change).

---

## 3. Kill-switch (I3 + I13)

**N/A — diagnostic only.**

| Switch | Default | Relevant path |
|--------|---------|---------------|
| `__TALARIA_MC_DISABLE_MIRROR_PREPEND_COMPENSATION` | fix ON | `_applyMultichartMirrorPrependCompensation` (`chart.js:2447–2527`) — H-S73 RED leg |
| `__TALARIA_MC_DISABLE_BOOT_HOST_REANCHOR` | fix ON | Host boot index-pin (`chart.js:17187–17334`) |
| `__TALARIA_MC_DISABLE_BOOT_PANEL_REANCHOR` | fix ON | Peer boot index-pin (`chart.js:17209–17344`) |

Proposed fix switch (not implemented): `__TALARIA_MC_DISABLE_RELEASE_SNAPBACK_PREPEND_POLICY` or extend prepend policy under `__TALARIA_MC_DISABLE_MIRROR_PREPEND_COMPENSATION`.

---

## 4. Proof — RED → GREEN

### H-S73 pin fidelity (mandatory)

```text
cd "chart v 1.4/chart/multichart-prod/harness"
node run.mjs --pending --only=H-S73
```

| Result | Evidence |
|--------|----------|
| **FAIL-REAL-BUG** | `A.dataLen 1201->1201` — host drag did **not** extend master (vacuous). `B.offsetX` unchanged both GREEN and RED legs. |

**Verdict: H-S73 is NOT a faithful pin for TAL-01579.**

| Criterion | H-S73 today | TAL-01579 needs |
|-----------|-------------|-----------------|
| Symptom | Peer offset shifts when **host** loads history | **Panel** snaps to **grab point** on **mouseup** after user pan |
| Actuation | `dragCellRight(page, 'A')` host-only | Real pan on **target panel** during paused replay; measure **at release + settle** |
| Assertion | `B.offsetX` delta after host drag | `|settledOffsetX - grabOffsetX| < ε` **while** `|releaseOffsetX - grabOffsetX| > material` → snap-back RED |
| Timing | During load (1.5s sleep) | Post-release async pan-load / mirror extend window |

H-S73 remains a valid **B-FIX-C prepend-compensation** probe once host backward-load is non-vacuous; it does **not** capture release snap-back.

**Related scenarios (partial overlap, not TAL-01579 pin):**

- **H-S18(c)** — no snap-back to **playhead** after mid-play drag (not grab-point).
- **H-S78** — no snap-back to playhead after play-drag release (BL-16/A9).
- **H-S28/H-S31** — boot index-pin shake (resize), not drag-release.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I1–I2 | Zero product diff |
| I14 | N/A — read-only; future fix may touch iframe mirror extend |
| I15 | H-S73 run is real mouse drag; failure is vacuous setup, not false green on snap-back |
| Not guard #21 | Confirmed — anchor/prepend policy cell, not mirror-frame guard |

---

## 6. What I did NOT do / limits

- Did **not** implement **H-S79** (spec only below).
- Did **not** run PO staging repro for grab-point snap.
- Did **not** capture async race timing (release → `_scheduleReplayPanLoadLeft` → mirror extend) with runtime probes.
- Harness host-drag may not trigger `checkViewportLoadMore` in stub replay window — H-S73 vacuous failure needs Lane 4 actuation review.

---

## 7. Live-verification handoff

**PO confirm TAL-01579:**

1. Multichart, same symbol, sync OFF, enter **paused** replay.
2. On panel B (or repro panel): note viewport, **mousedown**, drag **right** into history (>3 screens).
3. **Release** — watch whether viewport **jumps back** toward mousedown position (grab point), not merely toward playhead.
4. Optional: drag host A into history first (prepend), then drag panel B — tests prepend-compensation interaction.
5. Network: note if snap coincides with `/bars` or mirror extend (refetch) vs pure offsetX write (index-pin).

Record build id, panel id, and whether snap happens **immediately on mouseup** or **~40–200ms later** (pan-load debounce).

---

## 8. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)**

**Escalation verdict:** Prepend-compensation / index-pin **policy change** required — **Director sign-off** before implementation (D-014 ruling 3).

---

# Mechanism report

## Drag-release path (file:line)

### 1. Pan release (all charts)

```
mouseup / handleMouseUp (chart.js:32315+)
  → pan end (32387+)
  → _flushChartPanFrame / _snapPanOffsetToHardBounds (32412–32413)
  → replaySystem.onUserPan() (32415) — userHasPanned=true, autoScrollEnabled=false (replay-system.js:5748–5754)
  → _scheduleReplayPanLoadLeft() (32416) — debounced backward load (chart.js:25750+)
  → render() (32420)
```

`drag.startOffsetX` is captured at mousedown (`chart.js:31994`) but **never restored on release** — literal snap to `startOffsetX` is **not** a direct code path. PO “grab point” is the **viewport anchor at grab time** (bar index + offsetX), not a variable read of `startOffsetX`.

### 2. (a) Index-pin restoring pre-drag anchor

| Mechanism | Location | When it fires |
|-----------|----------|---------------|
| Boot host index-pin | `chart.js:17187–17334` (`_mcBootHostRightIdx`) | Frozen boot resize — first paint pins `offsetX = plotW - (ri+1)*spacing` |
| Boot peer index-pin | `chart.js:17209–17344` (`_mcBootPanelRightIdx`) | Peer boot resize — same formula |
| Host visible-end pin (no prepend comp) | `chart.js:3454–3459` | `_multichartMirrorHostTfSwitchIfReady` when `!mirrorPrependCompensation` — pins to **parent `getVisibleEndIndex()`** |
| Range-sync realign | `chart.js:4075–4125` | `_realignMultichartViewportAfterResize` when visible-range sync ON |

**TAL-01579 linkage:** If release triggers layout settle, mirror TF sync, or host mirror commit **without** `userHasPanned` honored, index-pin recomputes offset from a **stale right-edge bar index** captured before the drag — viewport returns to the bar alignment at grab time.

`_syncIndependentPanelViewportIfNeeded` (`chart.js:5320–5351`) explicitly **skips** recenter when `userHasPanned` — unless that flag is cleared or bypassed before settle completes.

### 3. (b) Prepend-compensation offset applied twice / wrong baseline

| Step | Location | Effect |
|------|----------|--------|
| Owner backward load | `chart.js:23195–23208` | `offsetX -= shiftBars * spacing`; `currentIndex += prepended` |
| Mirror extend from host | `chart.js:5862–5880` (`_tryExtendReplayMasterFromParent`) | Same shift on iframe when host master grows |
| B-FIX-C mirror clone | `chart.js:3376–3421` + `2490–2527` | Snapshot offset **before** clone; after mirror, `offsetX = snapshot.offsetX - addedDisplayBars*spacing` and `replay.currentIndex += addedRawBars` |
| Index-pin fallback | `chart.js:3454–3459` | If compensation returns null → **full index-pin** to host right edge |

**Conflict (snap-back mechanism):**

1. User pans panel → `offsetX` moves by drag delta; `onUserPan()` sets ownership.
2. On release, `_scheduleReplayPanLoadLeft` (or host extend + `_broadcastMultichartMasterExtendIfHost`) prepends bars **asynchronously**.
3. Mirror path runs `_captureMultichartMirrorPrependSnapshot` at clone time — if snapshot predates drag delta or uses **host** viewport index while panel had diverged, `_applyMultichartMirrorPrependCompensation` shifts offset as if the panel never moved.
4. Alternatively, owner prepend shifts offset **again** on a panel that already compensated during drag (`_tryExtendReplayMasterFromParent` lite path during pan sync) → **double-shift** back toward grab anchor.
5. H-S18(d) proves the **play-follow + prepend** double-shift is gated when auto-scroll engaged; TAL-01579 is the **paused / release / userHasPanned** variant where compensation baseline may still be grab-time.

### Distinguishing (a) vs (b)

| Signal | (a) Index-pin | (b) Prepend compensation |
|--------|---------------|------------------------|
| Timing | Often same frame as resize/mirror commit | 40–200ms+ after release (pan-load debounce) |
| `currentIndex` jump | Matches `getVisibleEndIndex` / boot `ri` | `+= addedRawBars` from snapshot |
| Switch OFF test | Boot reanchor switches | `__TALARIA_MC_DISABLE_MIRROR_PREPEND_COMPENSATION` |
| Host vs panel drag | Pin follows **host** right index | Shift uses **snapshot.offsetX** from before clone |

---

## Proposed prepend-compensation policy (TAL-01579 cell)

**Policy table cell:** `playing×drag` + `release snap-back × adopt-X` — **Gap** (`T8-MIRROR-POLICY-TABLE.md` §4).

**Correct release behavior (TARGET):**

1. When `replay.userHasPanned === true` (set on pan release via `onUserPan`), **no** index-pin or prepend compensation may move `offsetX` toward pre-drag or host-right anchors until the user recenters (follow button / enableAutoScroll).
2. Prepend compensation on mirror clone must use snapshot taken **after** the user's drag delta is applied, OR apply compensation relative to **visible window origin** (first visible bar ts), not raw `offsetX` at grab.
3. `_tryExtendReplayMasterFromParent` during/after release must not subtract `shiftBars * spacing` if the panel already shifted for the same prepend during the active pan gesture (idempotent per prepend event).
4. Boot index-pins (b102/b103) must not run on post-release layout noise while `userHasPanned`.

**Scoped fix vs shipped-behavior change:**

- **Scoped technically** — gate existing compensation/index-pin paths on `userHasPanned` + drag-generation token.
- **Escalation-class behaviorally** — changes when viewport recenters after user pan in multichart replay; alters D-014 **release snap-back × adopt-X** cell. **Requires Director sign-off** per D-014 ruling 3 — do not fold into `__TALARIA_DISABLE_MIRROR_POLICY_V2` migration silently.

**Kill-switch recommendation:** `__TALARIA_MC_DISABLE_RELEASE_VIEWPORT_OWNERSHIP` (default ON = new policy) gating all post-release anchor writes when `userHasPanned`.

---

## RED scenario spec — H-S79 (do not implement yet)

**Id:** `H-S79` — `TAL-01579: no grab-point snap-back on drag-release (paused replay)`

**Setup:**

- 2v same-pair, sync OFF, interval sync OFF
- Enter paused replay on all panels (`enterReplayPausedAll`)
- Target: **panel B** (iframe)

**Actuation (I15 — real mouse):**

1. `grab = readPanelFollow(B)` — record `offsetX`, `i0` (first visible bar index)
2. `dragCellRight(page, 'B', { screens: 3 })` — real pan into history
3. `atRelease = readPanelFollow(B)` immediately after mouseup
4. `await sleep(2500)` — cover pan-load debounce (40–200ms) + mirror extend
5. `settled = readPanelFollow(B)`

**Assertions:**

| Check | RED (current) | GREEN (fix) |
|-------|---------------|-------------|
| Drag moved viewport | `|atRelease.offsetX - grab.offsetX| > 40` | same |
| No grab-point snap | `|settled.offsetX - grab.offsetX| < 30` **AND** drag moved → **FAIL** | `|settled.offsetX - atRelease.offsetX| < 15` **OR** `|settled.offsetX - grab.offsetX| > 30` |
| User ownership preserved | `settled.userHasPanned === true` | same |
| Optional prepend leg | Host drag + panel drag sequence; assert no double-shift | `settled.offsetX` stable after host extend |

**Kill-switch A/B:**

- GREEN with default (fix ON)
- RED with `__TALARIA_MC_DISABLE_MIRROR_PREPEND_COMPENSATION=true` **only if** mechanism (b) confirmed; else dedicated release-ownership switch

**Gate placement:** Pending until H-S79 implemented; do not replace H-S73 in `known-failing.json` — H-S73 stays B-FIX-C family.

---

## H-S73 tightened spec (documented, logic unchanged)

**Purpose:** Prove mirror peer `offsetX` shifts when host backward-pan prepends master (B-FIX-C).

**Required non-vacuous setup:**

- Host drag must increase `A.dataLen` or `replaySystem.fullRawData.length` (poll until growth or fail setup)
- Paused replay with `hasMoreLeft=true` near left edge
- Assert peer B: `|ΔoffsetX| > 8` when master prepends (GREEN); flat when switch OFF (RED)

**Explicitly out of scope:** TAL-01579 grab-point snap on panel self-drag release → **H-S79**.
