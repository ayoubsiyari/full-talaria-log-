# Dev Response — Talaria QA Data (T1 batch)

**From:** chart / data dev  
**Date:** 2026-07-02  
**Re:** `DATA_VALIDATION_T1_FINDINGS.md`

---

## Item 1 — Scalar excursion fields (`mae_r` / `mfe_r` / `total_mfe_r`)

**1a. How are they derived?**

Previously (v1 batch): scalars were computed **independently** from mentor `high_price` / `low_price` via `_excursions()` in `scripts/adapt_mentor_xlsx_to_talaria.py`, while **bar arrays** were built separately from synthetic OHLC bars via `_build_trade_path_arrays()`. That is why arrays were correct but scalars did not reconcile.

**Now (v2 batch, seed `20260702`):** scalars are derived **from the bar arrays** after path build, using `_finalize_excursion_scalars_from_path()` — same rules as production `order-manager.js` → `_finalizeExcursionScalars()`.

**1b. Sign + direction convention currently used?**

- `mae_r` sign: **negative** (`≤ 0`) — adverse magnitude with negative sign  
- Direction handling: **encoded in per-bar arrays** (`bar_high_r` = favorable per bar, `bar_low_r` = adverse magnitude per bar); scalars are `max(bar_high_r)` and `-max(bar_low_r)`  
- `mfe_r` definition: **`max(bar_high_r)` in-trade** (not running envelope)  
- `total_mfe_r`: **`max(max(bar_high_r), max(post_exit_bar_high_r))`**  
- `capture_ratio`: **signed `rMultiple / total_mfe_r`** (losers negative)

**1c. Can they be regenerated to our convention?** (`mae_r ≤ 0`, `mfe_r ≥ 0` = max favorable, `total_mfe_r ≥ mfe_r`, reconciling with the bar arrays)

- [x] **Yes — regenerated at the generator level** (adapter fix + full batch rerun, seed `20260702`)

**1d. If yes, is the mismatch a bug in the scalars, or is our import expected to normalize?**

**Bug in the v1 adapter scalars** — not an import-normalization issue. Bar arrays were always the source of truth; scalars were a legacy independent estimate from price extremes with **positive `mae_r`** and caps that pulled `mfe_r` away from `max(bar_high_r)`.

Dashboard path math was fine; raw-file inspection showed the bug. **Fixed in `adapt_mentor_xlsx_to_talaria.py`.**

**Re-validation sample:** `mentor data/generated/t1/qa_gen_t1_eurusd_scalper-talaria-adapted.xlsx` (v2) — on our check: **330/330** rows with `mae_r ≤ 0`, **330/330** with `mfe_r == max(bar_high_r)`, **330/330** with `total_mfe_r ≥ mfe_r`.

---

## Item 2 — Source-type flag mapping

**2a. T1 mapping — confirm:**

- `sourceType = "backtest"`, `session_mode = "standard_backtest"`, `accountType = "private"` → `isLived = false`, `isPropConstrained = false` (Type 1)?
- [x] **Confirmed**

Optional aliases on adapted rows: `originSource = "mentor_import"`, `category_sheet = "Standard Backtest"`, numeric `source_type = 1` (set in `_apply_source_metadata`).

We do **not** emit `isLived` / `isPropConstrained` columns in the 140-col export — map from the strings above (or from `source_type` when present).

**2b. T3 (live_personal) — string values it will carry:**

- `sourceType` = **`"journal"`**
- `session_mode` = **`"live_journal"`**
- `accountType` = **`"private"`**
- Should map to `isLived = true`, `isPropConstrained = false` (Type 3 personal live journal)
- Additional fields for live-discipline unlock:
  - `originSource` = **`"mentor_import_live"`**
  - `category_sheet` = **`"Journal"`**
  - `planAdherence` / `planReviewKey` / `demons` / `postTradeNotes.mentorImport` (populated by adapter live synthesizer)
  - `sourceKey` / `sourceFilterKey` = `journalAccount:{profile_id}`

**T3 batch:** delivered in `mentor data/generated/t3/` (10 mentor + 10 adapted), same manifest as T1.

---

## Item 3 — Completeness / flats

**3a. Missing files — will resend:**

- [x] `qa_gen_t1_eurusd_scalper` **adapted** file — included in v2 package (`mentor data/generated/t1/`)
- [x] `qa_gen_t1_gbpusd_london` **mentor input** — included in v2 package

Both files were present in our local tree; v2 re-delivers the **full T1 folder** (20 xlsx) so nothing is missing.

**3b. T3 batch (10 files) delivery:** **Attached / in repo** — `mentor data/generated/t3/` + `manifest.json` (seed `20260702`). Same schema and scalar fix as T1.

**3c. Flat trades (`rMultiple == 0`):** **Yes — intended.** Generator emits breakeven/scratch exits (`close_type = BE`, manual scratch at entry) at roughly **5–10%** of rows per file. They are neither winners nor losers in outcome splits.

---

## Corrected re-delivery checklist (if applicable)

- [x] Scalars regenerated to our convention and reconciling with bar arrays  
- [x] One corrected sample file attached for re-validation: `qa_gen_t1_eurusd_scalper-talaria-adapted.xlsx` (v2)  
- [x] Missing T1 files included (full `t1/` folder)  
- [x] Manifest updated (`mentor data/generated/manifest.json`, seed `20260702`, counts changed vs v1)

## Notes / anything else

- **Regenerate command:** `py scripts/generate_mentor_t1_t3_batches.py --seed 20260702`  
- **Adapter fix location:** `scripts/adapt_mentor_xlsx_to_talaria.py` → `_finalize_excursion_scalars_from_path()`  
- **v1 → v2:** trade counts differ slightly (new RNG seed); structure and columns unchanged (mentor 30 cols, adapted 140 cols).  
- If your import layer maps `isLived` / `isPropConstrained`, we recommend:

| Type | `sourceType` | `session_mode` | `isLived` | `isPropConstrained` |
|------|--------------|----------------|-----------|---------------------|
| T1 | `backtest` | `standard_backtest` | false | false |
| T2 | `backtest` | `prop_backtest` | false | true |
| T3 | `journal` | `live_journal` | true | false |
| T4 | `journal` | `live_prop` | true | true |

- Page 5: continue treating **`bar_*_r` arrays as canonical**; v2 scalars now match for file inspection and scalar-only consumers.
