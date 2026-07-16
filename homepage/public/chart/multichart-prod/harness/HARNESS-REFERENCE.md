# Frozen harness reference (Lane 4 — D-021 / D-023)

**FROZEN HARNESS REFERENCE (hit-coord actuation):** `react-parity-lib.mjs` SHA256 `D8FBDDD63BD75332AB2CF25C9810A88527A0B2FE7F5BB6FAE49E3CFC301A625F` (post-hook SHA `1F4F64A79B746FD0AD6ECE26A854B337DF553A29514F6436E48F93A389ED0ABE` includes D-021/D-023 hooks)  
**Trees:** `chart v 1.4/chart/multichart-prod/harness/` and `homepage/public/chart/multichart-prod/harness/` (I8 mirror).

## D-023 standing rule — per-row discriminators (mandatory)

Every **trusted** react-parity row must have a **named discriminator** that provably flips the row **10/10 FAIL-REAL-BUG** when the mechanism is off. When a fix moves load (e.g. `ecaa8a9c`), the discriminator moves with it via escalation — never silently.

| Row | Default | Discriminator OFF arm | Window / mechanism |
|-----|---------|----------------------|-------------------|
| **H-R02** | `--only=H-R02 --runs=10` → 10/10 PASS | `--hr02-actuation-miss` → 10/10 FAIL | Harness: real mouse click on empty canvas (store-empty miss surface). **No engine one-knob found on `20260716b10`** — see D-023 report. |
| **H-R03** | `--only=H-R03 --runs=10` → 10/10 PASS | `--iframe-ctrl-dedupe-off` → 10/10 FAIL | `__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1` (`ecaa8a9c`) |
| **H-R06** | `--only=H-R06 --runs=10` → 10/10 PASS | `--panel-keyboard-off` → 10/10 FAIL | `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` |
| **H-R07** | `--only=H-R07 --runs=10` → 10/10 PASS | `--phase5-off` → FAIL (≥9/10) | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION` |

### H-R02 A/B commands

```bash
# Default — expect 10/10 PASS on build 20260716b10+
node react-run.mjs --only=H-R02 --runs=10

# Discriminator OFF — expect 10/10 FAIL-REAL-BUG (store not committed)
node react-run.mjs --only=H-R02 --runs=10 --hr02-actuation-miss
```

Alias: `--hr02-discriminator-off` (same as `--hr02-actuation-miss`).

### H-R03 A/B commands (replaces retired Phase-1 leg for H-R03)

```bash
node react-run.mjs --only=H-R03 --runs=10
node react-run.mjs --only=H-R03 --runs=10 --iframe-ctrl-dedupe-off
```

## P1 engine substrate — ledger note (D-023)

**`6dc552a8` / `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` stays committed and gated as defense-in-depth.** After `ecaa8a9c`, its **harness-visible load-bearing role for H-R02/H-R03 is UNPROVEN** (`--phase1-off` no longer flips either row on `20260716b10`). Retiring P1 as dead code requires a **fresh escalation with evidence** (a discriminator that flips when P1 goes off) — not a housekeeping commit.

## D-011 A/B switch-OFF hooks (engine proof)

| Row | CLI | Env | Window flag set at boot |
|-----|-----|-----|-------------------------|
| H-R03 dedupe | `--iframe-ctrl-dedupe-off` | `REACT_PARITY_IFRAME_CTRL_DEDUPE_OFF=1` | `__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1` |
| H-R06 Delete (P4) | `--panel-keyboard-off` | `REACT_PARITY_PANEL_KEYBOARD_OFF=1` | `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` |
| H-R07 peer iso (P5) | `--phase5-off` | `REACT_PARITY_PHASE5_OFF=1` | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION` |
| H-R07 peer iso (child) | `--peer-deselect-off` | `REACT_PARITY_PEER_DESELECT_OFF=1` | `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` |
| P1 master (legacy) | `--phase1-off` | `REACT_PARITY_PHASE1_OFF=1` | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` |
| P1 child lifecycle | `--lifecycle-off` | `REACT_PARITY_LIFECYCLE_OFF=1` | `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` |
| P1 child legacy retire | `--legacy-selection-off` | `REACT_PARITY_LEGACY_SELECTION_OFF=1` | `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` |

Lanes 1/2 own engine switches; Lane 4 owns harness wiring only.

## Actuation regression (hit-coord)

Any change to click/hit targeting, iframe coord translation, or keyboard actuation helpers in `react-parity-lib.mjs` **must** re-run **H-R02 + H-R03 discriminators** before results are trusted.

## gate:react session isolation (D-023 bless fix)

Full-suite `gate:react` sets `REACT_PARITY_ISOLATE_SESSION=1` → `react-run.mjs` launches a **fresh browser per scenario** (each scenario still gets its own cold page via `runWithReact`). This matches isolated-run fidelity and prevents Chromium session bleed between scenarios.

Manual full suite: `node react-run.mjs` (auto-enables when `--only` is unset and scenario count > 1) or `node react-run.mjs --isolate-session`.

Panel-B parent chrome: scenarios that open settings/gear after iframe selection call `awaitParentChromeAfterPanelSelect()` (focus + settle + `waitForV9QuickBarReady`, 8s budget on panel B).
