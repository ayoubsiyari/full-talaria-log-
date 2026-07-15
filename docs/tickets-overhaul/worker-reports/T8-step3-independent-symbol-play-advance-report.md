# T8 step 3 — independent-symbol play-advance FIX (TAL-01590)

**Date:** 2026-07-15  
**Directive:** D-014 ruling 2  
**Lane:** 2  
**Staging build id:** `20260715a1` (harness `serve.mjs`)

---

## 1. Task + RC

| Field | Value |
|---|---|
| Task id | T8 step 3 — independent-symbol play-advance fix |
| Goal | H-S59b production-faithful scenario + own-master PLAY advance cell behind kill-switch; staging for PO live feel-check |
| RC | RC-8 — independent-symbol × playing policy gap (TAL-01590 P1 freeze) |

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` | **Fix:** `!isSameSymbolAsHost && isPlaying` → `scheduleCoalescedSeek(ch, ts, true)` gated by `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` (default fix ON) |
| `homepage/public/chart/multichart-prod/panel-cmd-bridge.js` | I8 mirror |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` | `multi-independent` pair (B=27, C=28); `__multichartGrid` for host broadcast; build id `20260715a1` |
| `homepage/public/chart/multichart-prod/harness/serve.mjs` | I8 mirror |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | **H-S59b** + helpers (`startHostProductionTickPlay`, `readPanelReplayProbe`, wall-clock sampling) |
| `homepage/public/chart/multichart-prod/harness/scenarios.mjs` | I8 mirror |
| `chart v 1.4/chart/multichart-prod/harness/harness-lib.mjs` | Document `multi-independent` pair |
| `homepage/public/chart/multichart-prod/harness/harness-lib.mjs` | I8 mirror |
| `docs/tickets-overhaul/MANAGER-FINDINGS.md` | Lane 4 H-S59b actuation sign-off block (D-014 ruling 4) |

**No other files touched.** Did not edit `react-parity-lib.mjs` or `known-failing.json`.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Files gated |
|--------|---------|-------------|
| `window.__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` | OFF (fix **ON** when unset) | `panel-cmd-bridge.js` `applyReplayFrame` (~810–819) — iframe panels via `chart-embed.html` load same bridge |

Set `= true` before boot (harness `evaluateOnNewDocument`) to revert to mirror+catch-up only path. **I13 note:** fix is iframe-only (`panel-cmd-bridge.js`); host tile uses `replay-system.js` broadcast — no host-file change required because independent advance is panel-local.

---

## 4. Proof — RED → GREEN

### H-S59b actuation (I15)

| Field | Value |
|-------|-------|
| Setup | `multi-independent` 3-panel: A=file25, B=file27, C=file28; sync OFF; B display TF 1h |
| Actuation | `replayPlay {mode:'tick'}` + host `rs.play()` tick mode — **no** `hostReplaySeek`, **no** synthetic replayFrame loop |
| Measure | Wall-clock samples every 2s × 10s: per-iframe `replaySystem.replayTimestamp` |

### Commands

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
npm run test -- --pending --only=H-S59b --runs=1
npm run test -- --only=H-S17,H-S19,H-S19b --runs=1
npm run gate
```

### H-S59b result (fix ON)

```
H-S59b host A replayTs delta=780000 (monotonic samples)
H-S59b independent B replayTs delta=780000 — ADVANCES
H-S59b independent C replayTs delta=780000 — ADVANCES
RESULT H-S59b PASS
```

### Kill-switch A/B

Harness stub mirror frames can keep B aligned even with switch ON on tick/candle play (Bdelta fix-OFF ≈ fix-ON). RED sub-check verifies switch pre-set + fix-ON candle advance non-vacuous; **PO live** must confirm revert on staging.

### BL-10/11/12/13 family

Run `H-S17,H-S19,H-S19b` with gate — no regressions expected (independent branch is `!isSameSymbolAsHost` only).

### SHA256 (I8)

| File | SHA256 |
|------|--------|
| `panel-cmd-bridge.js` | `FD116F6E2C4DF5C0488D305A509A64547E8FC917B8BE4874BA60F7D5C0341ECF` |
| `scenarios.mjs` | (post-H-S59b — mirror verified at copy) |
| `serve.mjs` | `9ED81525645B4D090C919ED63100B7356E8BCD7710C1C3411942FA7E5CD925A2` |

---

## 5. Invariants checked

| Invariant | How satisfied |
|---|---|
| I8 | All touched trees mirrored byte-identical |
| I9 | H-S59b in `t8PendingScenarioList` only — gated baseline unchanged |
| I11 | Sanctioned policy-cell change per D-014; not a new tail guard |
| I15 | Real iframe `replayTs` samples; production tick play actuation |
| D-012 | No `react-parity-*` edits |

---

## 6. What I did NOT do / limits

- **Lane 4 actuation sign-off** pending — flagged in `MANAGER-FINDINGS.md`.
- Harness kill-switch RED does not separate tick-play paths (mirror frames advance B with switch ON); PO staging confirm required for revert feel.
- H-S59 (contract-only with `hostReplaySeek`) unchanged — not accepted as fix proof per D-014.
- Did not promote H-S59b to `known-failing.json` (Lane 4).

---

## 7. Live-verification handoff

**PO on staging build `20260715a1`:**

1. Open **2v+** multichart; set panels to **different symbols** (not symbol-synced).
2. Enter replay; press **Play** (tick mode preferred — matches H-S59b).
3. Confirm **every panel playhead advances** — no iframe frozen while host runs.
4. Build id inside host **and** each panel iframe.

**Manager:** Lane 4 — run H-S59b, sign off actuation line in `MANAGER-FINDINGS.md`.

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

H-S59b PASS on harness; fix landed behind kill-switch; staging build id `20260715a1`. Blocked on Lane 4 actuation sign-off + PO staging feel-check before **DONE (proven)**.
