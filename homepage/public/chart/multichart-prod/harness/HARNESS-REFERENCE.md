# Frozen harness reference (Lane 4 — D-021)

**FROZEN HARNESS REFERENCE (hit-coord actuation):** `react-parity-lib.mjs` SHA256 `D8FBDDD63BD75332AB2CF25C9810A88527A0B2FE7F5BB6FAE49E3CFC301A625F`  
**Trees:** `chart v 1.4/chart/multichart-prod/harness/` and `homepage/public/chart/multichart-prod/harness/` (I8 mirror).

## Actuation regression discriminator (mandatory)

Any future change to click/hit targeting, iframe coord translation, or keyboard actuation helpers in `react-parity-lib.mjs` **must** re-run the Phase-1 A/B before results are trusted:

```bash
# Phase 1 ON — expect 10/10 PASS
node react-run.mjs --only=H-R02,H-R03 --runs=10

# Phase 1 OFF — expect H-R03 10/10 FAIL-REAL-BUG (substrate required)
node react-run.mjs --only=H-R02,H-R03 --runs=10 --phase1-off
```

If `--phase1-off` no longer restores H-R03 RED, the harness is **not** discriminating and must not be used for green claims.

## D-011 A/B switch-OFF hooks (engine proof)

| Row | CLI | Env | Window flag set at boot |
|-----|-----|-----|-------------------------|
| H-R02/H-R03 Phase 1 | `--phase1-off` | `REACT_PARITY_PHASE1_OFF=1` | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` |
| H-R06 Delete (P4) | `--panel-keyboard-off` | `REACT_PARITY_PANEL_KEYBOARD_OFF=1` | `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` |
| H-R07 peer iso (P5) | `--phase5-off` | `REACT_PARITY_PHASE5_OFF=1` | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION` |
| H-R07 peer iso (child) | `--peer-deselect-off` | `REACT_PARITY_PEER_DESELECT_OFF=1` | `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` |

Lanes 1/2 own engine switches; Lane 4 owns harness wiring only.
