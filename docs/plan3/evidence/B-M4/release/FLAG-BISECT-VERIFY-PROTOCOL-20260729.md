# FLAG-01 / FLAG-02 — bisect protocol (blocking)

**When:** 2026-07-29  
**Why:** A is firing leak suspects in parallel, each behind its own switch. Attribution requires every flag to be **individually reversible at runtime without reload**. A flag that fails this is a **blocking defect** — do not ship-credit it; escalate to A before the next canary stamp that depends on it.

---

## Rules

| ID | Requirement | Fail means |
|---|---|---|
| **FLAG-01** | Testable against **ABSENT** — unset property ⇒ fix/path **ON** (production default). Never require explicit `false`. | Init-time `=== false` strand, or presence-at-any-value disable |
| **FLAG-02** | Flippable **without reload** — read at each decision point (own realm then host). Mid-session `true` → OFF; `delete` → ON again. | Sampled once at init/closure; cannot bisect live |
| **FLAG-03** | Kill-switch **OFF-path is a working product** — boot/`= true` must still load, paint, and have data (or the equivalent product assertion for that path). Verifying only that the feature is inactive is **not enough**. | Disable restores a latent defect (e.g. PURGE-2 black panels); one-way switches marked in the canary runbook |

**Independence:** flipping flag X must not require flipping flag Y. Welded switches break the bisect — **block**.

---

## Per-flag cells (run as each lands)

1. **ABSENT** → feature/path active (FLAG-01).  
2. **`= true`** → disabled / legacy path (no reload).  
3. **`= false`** / **`= undefined`** → still active (not treated as disable).  
4. **`delete` property** → active again without reload (FLAG-02).  
5. **FLAG-03:** with **`= true`**, assert a **working product** outcome (chart loads / paints / has data, or path-specific equivalent). Not merely “feature inactive”.  
6. **On-wire** after deploy: `grep` / fetch confirms the flag string is in the served bytes that execute the path.

Harness preferred (A’s packet tests). If none: a minimal vm/browser cell exercising the reader helper through the four states in one realm **plus** an OFF-path product assertion.

**Verdict:** PASS FLAG-01/02/03 → ship with stamp. FAIL any → **BLOCKING**; journal + notify A; do not treat the canary as carrying a usable bisect lever for that suspect. If FLAG-03 is truly impossible, mark the switch **ONE-WAY** in the canary runbook — repair preferred.

---

## Already on canary (baseline)

| Flag | Stamp | FLAG-01 | FLAG-02 |
|---|---|---|---|
| `MC_PANEL_STATE_PURGE_V1` | b83+ | PASS | PASS |
| `MC_GRID_STATE_PURGE_V1` | b83+ | PASS | PASS |
| `MC_BAR_STORE_REALM_V1` | **b84** | PASS | PASS (P3 16/16 four-state) |
| `SHARED_BAR_STORE` | prior | PASS | PASS |

Expected next: chart.js data-cache suspects (`_tfDataCache` / `_btTfDataCache` / `_smartPrefetchCache` class) — verify each name as it appears on `manager-a/critical-path`.
