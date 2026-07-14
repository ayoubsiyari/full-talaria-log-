# T0 step 14 — real cross-frame actuation harness (Lane 4 BUILD)

## 1. Task + RC

**Task:** T0 step 14 — BUILD honest real-actuation harness on build `20260712b105` (Worker 1 b105 prototype for Esc/Delete/Objects-Tree). Exclusive ownership of `react-parity-lib.mjs`. Deliver honest RED baseline + `gate:react` PASS.

**RC:** Tooling/diagnostic — no RC. Discharges ESC-011 / D-012 (I15 honest harness).

---

## 2. What I changed — file by file

| Path | Change |
|------|--------|
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | Added `localToPagePoint`, `drawingHitLocalPoint`, `readDrawingSelectedInStore`, `readParentV9BarVisible`. Replaced all user-gesture paths with `page.mouse` / `page.keyboard` at iframe-translated coords. Removed `selectDrawing` fallback, iframe `dispatchEvent` dbl-click, `editDrawing` fallback, `ctrlDragMarqueeInIframe`, `handleKeyDown` / `dispatchEvent` for Esc/Delete. Tightened `readSelectionChrome`, `isDrawingSelected`, `assertReactMenuState` to store + parent V9 bar (I15). |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` | H-R02 store-first selection; H-R04/H-R09 `waitForParentDrawingSettingsOpen`; H-R05 settings-before-Esc gate; H-R12/H-R12A real `singleClickDrawing` (no `dm.selectDrawing`); H-R14 store multi-select assert. |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Honest RED baseline: 12 tracked-red rows on b105 (only H-R12A green). |
| `homepage/public/chart/multichart-prod/harness/react-parity-lib.mjs` | Byte-identical mirror (I8). |
| `homepage/public/chart/multichart-prod/harness/react-parity-scenarios.mjs` | Byte-identical mirror (I8). |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/multichart-prod/harness/step14-gate-react.txt` | First gate run (pre-baseline reconcile). |
| `chart v 1.4/chart/multichart-prod/harness/step14-gate-react-pass.txt` | Final gate PASS evidence. |

**No other files touched.** No product/React/engine edits.

---

## 3. Kill-switch (I3 + I13)

N/A — harness-only change. Existing `REACT_PARITY_GEAR_FIX_OFF` / boot switches unchanged; scenarios still boot default ON. Switch-OFF rows not re-run in this step.

---

## 4. Proof — RED → GREEN

### Commands

```text
cd "chart v 1.4/chart/multichart-prod/harness"
node serve.mjs   # port 8791
npm run gate:react
```

**Build:** `20260712b105` (confirmed in harness boot + panel-B iframe).

### RED (pre-baseline reconcile)

First `gate:react` on honest harness: **6 regressions** vs old 6-row baseline (`H-R01`, `H-R02`, `H-R03`, `H-R07`, `H-R12`, `H-R13`). Evidence: `step14-gate-react.txt`.

Key honest failures exposed (synthetic greens removed):

- **Selection:** `readReactParityState.selectedIds` populated but `dm.selectedDrawings` / `d.selected` false — orphan chrome handles without store selection (H-R01/02/07/09).
- **Panel-B V9 bar:** real click does not surface `#tl-sett` (H-R12); gear-ready timeout.
- **Settings:** real dbl-click does not open parent modal on host or panel-B (H-R04/09/13); H-R12A panel-A gear still **PASS**.
- **Delete:** real `page.keyboard.press('Delete')` — drawing remains in store on host (H-R06); panel-B same.
- **Marquee:** host real Ctrl+drag **PASS** (w=460,h=549); panel-B real Ctrl+drag **FAIL** (`active:false,w:0,h:0`) — true marquee state revealed (H-R08 panel-B, H-R14).

### GREEN (honest baseline + gate)

Updated `knownFailing` to 12 rows; re-ran `gate:react`:

```text
Known failing baseline: H-R01, H-R02, H-R03, H-R04, H-R05, H-R06, H-R07, H-R08, H-R09, H-R12, H-R13, H-R14
Regressions (not in baseline but failed): (none)
REACT-GATE H-R12A PASS
[react-gate] PASS: no new regressions; 12 known-failing tracked.
```

Evidence: `step14-gate-react-pass.txt`.

### I15 actuation / measurement (per row)

| Row | Actuation | Measurement | Verdict b105 |
|-----|-----------|-------------|--------------|
| H-R01 | `page.mouse.click` at iframe-translated hit | `readDrawingSelectedInStore` + `readParentV9BarVisible` | **RED** store+V9 |
| H-R02 | real click | store selection; chrome diagnostic only | **RED** handles w/o store |
| H-R03 | real Ctrl+click | both ids in store | **RED** |
| H-R04 | real dbl-click | `waitForParentDrawingSettingsOpen` (modal+style) | **RED** host+panel-B |
| H-R05 | real dbl-click → real Esc | settings wait + store deselect + `readParentReactSettings` closed | **RED** settings never open |
| H-R06 | real Delete | `!drawingExists` + ghost checks | **RED** host+panel-B store |
| H-R07 | real cross-panel clicks | store single-owner + parent V9 cleared on host | **RED** neither store-selected |
| H-R08 | real Ctrl+drag all panels | `readCtrlMarqueeState` during drag + store multi-select | **RED** panel-B; host **PASS** |
| H-R09 | real single→dbl→Esc | store+V9+settings+Esc closed | **RED** |
| H-R12 | real click panel-B + real gear mouse | `waitForParentDrawingSettingsOpen` | **RED** no V9 gear |
| H-R12A | real click panel-A + real gear mouse | honest settings wait | **PASS** |
| H-R13 | real panel-B dbl-click | settings wait + 400ms persist | **RED** |
| H-R14 | real panel-B Ctrl+drag | marquee w/h + store multi-select | **RED** |

**Only proven green:** H-R12A (real actuation + real settings modal).

### Mirror SHA256 (both trees match)

| File | SHA256 |
|------|--------|
| `react-parity-lib.mjs` | `3DA74BAC6DD2F4DD7821E35332E5665FC290257CFCD6F46FD73FB110F9D3237D` |
| `react-parity-scenarios.mjs` | `C036A74B62C9802A31A33D84D20871EC9F42BFDB38120C742E618E71E986B779` |
| `known-failing.json` | `2ABBF7F977E6F44A5D8FDB3BFDDF1C7960A7FF1A2B2B6648C7FA632121901B4B` |

---

## 5. Invariants checked

| Inv | Status |
|-----|--------|
| **I8** | Harness files mirrored byte-identically; SHA256 verified. |
| **I9** | Manager `gate.mjs` untouched; `gate:react` only. |
| **I14** | All panel gestures use parent `page.mouse`/`keyboard` at iframe-translated page coords — no in-iframe `dispatchEvent` for user input. |
| **I15** | No proxy greens; store/settings/V9/marquee measured as real end-states. |
| **D-010** | Built `dist-v9` `20260712b105`; build id inside panel-B iframe at boot. |
| **I13** | Not exercised this step (switch-OFF re-run deferred). |

---

## 6. What I did NOT do / limits

- Did not edit product code (Lane 1 owns Esc/Delete/Objects-Tree/marquee fixes).
- Did not run 10/10 stability sweeps per row (single gate run for baseline).
- Did not implement CDP `Input.dispatch*` fallback (Puppeteer mouse sufficient for host; panel-B failures are product/routing not harness miss).
- H-R08 host marquee passes — panel-B fails with identical harness path; indicates iframe Ctrl+drag routing gap in product, not synthetic green.
- Worker 1 b105 Esc/Delete fixes: **partially visible** — Esc clears store when nothing was open; Delete still leaves drawings in store on honest keyboard path; panel-B V9/quick-menu still absent after real select click.

---

## 7. Live-verification handoff

**Build id:** `20260712b105` — 2v multichart backtest.

PO confirm on deployed build:

1. **Panel A:** place trendline → single click → V9 bar appears → gear opens Style modal (matches H-R12A PASS).
2. **Panel B:** same sequence — V9 bar should appear; gear should open parent settings (currently RED in harness).
3. **Panel B:** dbl-click drawing → parent settings modal with Style section (H-R13 RED).
4. **Either panel:** select drawing → Delete key → drawing gone from chart (H-R06 RED on host).
5. **Panel B:** Ctrl+drag over two drawings → blue marquee + both selected (H-R14 RED; host works per H-R08).

---

## 8. Status

**DIAGNOSTIC-ONLY (honest harness built, baseline delivered)** — Real-actuation harness is live and `gate:react` PASSes against the honest 12-row RED baseline on `20260712b105`. One row proven green (H-R12A). Product fixes required before rows leave `knownFailing`; PO live-confirm required for any future green claims per I15.
