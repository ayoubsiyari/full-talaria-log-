# T4 step 8 (Lane 3) — close / hit-target family report

**Task:** T4 step 8 family 1 — close / hit-target (#10, #20, #22)  
**RC:** RC-5 — order-entry preview close affordances + multi-entry leg removal sync  
**Build:** `20260712b53` (harness `serve.mjs`, `chart-embed.html` both trees)  
**Status:** DONE (proven on harness + property test); **NEEDS-LIVE-CONFIRM** for PO X-click on stacked multi-entry preview

**Rows discharged (this family):** TAL-00752#10, #20, #22

**Rows still open (other families):** #1, #4, #5, #8, #9, #11, #13, #14, #15, #19 + needs-live-confirm #2, #21

---

## 1. Task + RC

| Field | Value |
|---|---|
| Task id | T4 step 8 — close / hit-target family |
| RC | RC-5 — multi-entry close hit-targets, `entries[]`/`splitEntries` sync on leg remove, stacked-leg drag separation |
| Tickets | TAL-00752#10 (X unreliable), #20 (repeated X clicks), #22 (stacked legs stuck) |
| Switch | `window.__TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX` (default unset = fix ON) |

---

## 2. What I changed — file by file

| File | Change |
|---|---|
| `chart v 1.4/chart/modules/order-entry-aggregates.mjs` (+ mirror) | Added pure `computeMultiEntryStackIndices()` — stack index per level id when prices collide |
| `chart v 1.4/chart/modules/order-manager.js` (+ mirror) | Gated fix: stack Y offsets on preview lines/hit-lines; expanded close-badge hit pad; `data-level-id` + `data-level-stack-px` on badges; hover band uses stack px; `_finalizeMultiEntryLevelRemove()` after `removeMultiEntryLevel()` |
| `chart v 1.4/chart/modules/order-entry-close-hittarget.test.mjs` (+ mirror) | RED-first property test for stack indices + manager offsets + switch-OFF RED-again |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` (+ mirror) | Added **H-S58** probe (stack offset + remove sync + switch-OFF) |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` (+ mirror) | Registered H-S58 in `expectedTests` |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` (+ mirror) | Build id `20260712b53` |
| `chart v 1.4/chart/multichart-prod/chart-embed.html` (+ mirror) | Default build id `20260712b53` |

**no other files touched.**

---

## 3. Kill-switch (I3 + I13)

### `window.__TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX`

| Default | Fix ON when unset |
|---|---|
| Gated paths | `_multiEntryStackYOffsetPx`, stack offsets in `drawPreviewLine` / `alignPreviewLabels`, expanded close hit-pad, `_tagOmLevelCtrlLevelId`, stack-aware `_revealLevelCtrlBadges`, `_finalizeMultiEntryLevelRemove` in `removeMultiEntryLevel` |

**Switch OFF:** stacked legs share Y=0 hit targets (legacy); remove path skips `_finalizeMultiEntryLevelRemove` (legacy render/sync timing).

**Files gated:** `order-manager.js` only (both mirrored trees). Aggregates helper is pure logic; manager gates all consumer paths.

---

## 4. Proof — RED → GREEN

### Property test

```powershell
node "chart v 1.4/chart/modules/order-entry-close-hittarget.test.mjs"
```

GREEN (fix ON):

```text
GREEN — close/hit-target stack indices + manager offsets passed
```

RED-again (switch OFF):

```powershell
$env:TALARIA_TEST_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX='1'
node "chart v 1.4/chart/modules/order-entry-close-hittarget.test.mjs"
```

```text
GREEN — close/hit-target helpers present; switch OFF restores zero stack offset (RED-again)
```

(Second leg offset `y2=0` when switch OFF — non-vacuous legacy reproduction.)

### Harness H-S58 (determinism 3/3)

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
node run.mjs --only=H-S58 --runs=3
```

```text
FINAL H-S58 PASS (3/3 runs)
H-S58 switch-OFF: stackBefore y2=0 (RED)
```

### Full gate

```powershell
npm run gate
```

- **H-S58:** GATE PASS  
- **No new regressions** from order-entry changes  
- Gate exit code 1: **pre-existing** stale `known-failing.json` entries (`H-S51`, `H-S52`, `H-S53` now pass — Manager hygiene, not introduced by this step)

### Syntax

```powershell
node --check "chart v 1.4/chart/modules/order-manager.js"
```

Pass.

### SHA256 (I8)

| Pair | SHA256 |
|---|---|
| `order-manager.js` | `9D204A9A570A6AED5606E570A7585363254E8C5B73155B14E7FC8861974A744F` |
| `order-entry-aggregates.mjs` | `93217B27FB7D740D16C371AD3F654756C4EAA58B0F5DD6B8DE3329B46ABC8AE9` |

Both pairs byte-identical across `chart v 1.4/chart/**` and `homepage/public/chart/**`.

---

## 5. Invariants checked

| Invariant | How satisfied |
|---|---|
| I3 | One mechanism per switch; independently revertible |
| I5 | Order-entry preview only — no replay bus / multichart parity files |
| I8 | Both trees mirrored; SHA256 matched |
| I9 | H-S58 PASS; no harness scenario regressions from this diff |
| I13 | Switch gates every consumer path in `order-manager.js` |

---

## 6. What I did NOT do / limits

- **Families 2–4 not started** (parse/drag-input #8/#19, preview color #1/#13, singles #9/#11/#14/#15).
- **No live PO click test** on real multi-entry preview X buttons — harness probes `removeMultiEntryLevel` + stack offsets programmatically.
- **Main-entry cancel ✕** (`entry-cancel-btn`) not separately harnessed — shares badge machinery; PO should spot-check.
- Gate hygiene (`H-S51`–`H-S53` stale known-failing) left for Manager.

---

## 7. Live-verification handoff

On build **`20260712b53`**:

1. Open order entry, enable multi-entry (2+ legs).
2. Drag two legs to the **same price** — labels/hit lines should be vertically separated (~16px); each leg draggable independently.
3. Click **✕** on `Entry#2` once — leg removes immediately; remaining preview lines match panel rows (no second click).
4. Click main **✕** cancel — order draft clears reliably (expanded hit pad).
5. Optional: `window.__TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX = true` → stacked legs collapse to shared Y; remove may need extra clicks (legacy).

---

## 8. Status

**DONE (proven)** on H-S58 + property test (harness path).  
**NEEDS-LIVE-CONFIRM** for PO multi-entry X-click on built product.

---

## Mechanism summary

| Symptom | Fix |
|---|---|
| #10 X unreliable | Expanded transparent hit-pad on close badges; stack-aware hover band keeps badge clickable |
| #20 repeated X clicks | `_finalizeMultiEntryLevelRemove()` forces `splitEntries` + `updatePreviewLines` after `removeMultiEntryLevel` |
| #22 stacked legs stuck | `computeMultiEntryStackIndices` + 16px vertical offset on preview line, hit-line, label, and badge hover |

## Next family (Manager schedule)

**Family 2 — parse/drag-input (#8, #19):** lot arrow path + SL/TP arrow-drag seed price.
