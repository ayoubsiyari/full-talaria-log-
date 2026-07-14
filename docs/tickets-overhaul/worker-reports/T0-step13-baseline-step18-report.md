# T0 step 13 — baseline update after T1 step 18 + gate result

## Summary

**Baseline updated** per Manager instruction. **`gate:react` does not PASS** — H-R12 and H-R13 regress (not in `knownFailing` but FAIL on every run).

| Item | Status |
|------|--------|
| `H-R12A` added to `reactParity.expectedTests` | Done |
| `H-R12`, `H-R13` removed from `knownFailing` | Done |
| `gate:react` PASS | **FAIL** — regressions: H-R12, H-R13 |
| Canonical build | **`20260712b100`** (rebuilt `npm run build:live`) |
| SHA256 `known-failing.json` (both trees) | `6552F62DEFBCF5999115C43CFC2A0B3C126E1BC9B364C88A0E3A115F75371487` |

## `reactParity.expectedTests` (after)

`H-R01` … `H-R09`, `H-R12`, **`H-R12A`**, `H-R13`, `H-R14` (13 rows — matches `reactScenarioList()`)

## `reactParity.knownFailing` (after)

`H-R04`, `H-R05`, `H-R06`, `H-R08`, `H-R09`, `H-R14` (**6** tracked-red)

**Removed:** H-R12, H-R13 (Worker 1 step 18 claimed GREEN 10/10 on b97)

## Gate evidence (`step13-gate-react-final.txt`, build `b100`)

```
REACT-GATE H-R01 PASS
REACT-GATE H-R02 PASS
REACT-GATE H-R03 PASS
REACT-GATE H-R07 PASS
REACT-GATE H-R12A PASS
REACT-GATE H-R04..H-R06, H-R08, H-R09, H-R14 FAIL (known-failing)
REACT-GATE H-R12 FAIL  ← regression
REACT-GATE H-R13 FAIL  ← regression
[react-gate] FAIL: regression(s): H-R12, H-R13
```

**Solo stability (b100, `--runs=3`):** H-R12 FAIL 3/3, H-R13 FAIL 3/3, H-R12A PASS.

**Failure signature (both):** `quickBarShellOnly: true`, `textSnippet: "A"`, `hasStyleSection: false` — parent gear/dbl-click does not open real settings modal on **panel B**; H-R12A (panel A gear) opens full Style panel.

## Discrepancy vs T1 step 18

Worker 1 reported H-R12/H-R13 **10/10 PASS** on `20260712b97`. Lane 4 cannot reproduce on b97 or b100. `react-parity-lib.mjs` SHA256 matches step-18 report (`3FEF323A…`). `drawing-tools-manager.js` SHA256 **does not** match step-18 report (`B0B4B9F2…` vs `3143FD53…`) — possible tree drift or parallel lane overwrite.

## Real-actuation spec

Continued at [`T0-step13-real-actuation-spec.md`](T0-step13-real-actuation-spec.md). **Collision block cleared** — Lane 4 may implement `react-parity-lib.mjs` when directed.

## Manager decision needed

1. **Re-track H-R12/H-R13** in `knownFailing` so gate PASSes while panel-B iframe settings path is re-investigated, **or**
2. **Re-dispatch Lane 1** to restore panel-B gear/dbl-click on current tree (`b100`).

Until resolved, do **not** treat step-18 “proven” for panel-B settings.
