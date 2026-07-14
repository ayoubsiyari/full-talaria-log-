# T0 step 11 + 11b — reconcile react-parity baseline + unblock suite

## 1. Task + RC

**Task:** T0 step 11 (Lane 4) — reconcile `known-failing.json` after parallel lane edits; capture `gate:react` proof on combined build `20260712b88`. **Step 11b addendum** — unblock “stuck” full-suite sweep; confirm no new regressions via baseline-aware gate, not an all-rows `--runs=3` sweep.

**RC:** Tooling/diagnostic — no RC. Discharges D-010 durable gate + establishes Lane 4 as sole owner of `reactParity.knownFailing`.

---

## 2. What I changed — file by file

| Path | Change |
|------|--------|
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | **Probe fix (I13):** `readParentReactSettings` no longer treats V9 quick-bar shell text (`"A"`, `childElementCount > 0`) as “settings open”. Requires `messageOpen` (postMessage probe), visible `.tv-settings-modal`, or `hasStyleSection` in real settings content. |
| `homepage/public/chart/multichart-prod/harness/react-parity-lib.mjs` | Byte-identical mirror of probe fix (I8). |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Reconciled `reactParity.knownFailing` to **8 tracked-red** rows (see §4). Removed H-R01, H-R07 (GREEN). Added H-R12, H-R13 (honest probe). |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | Byte-identical mirror (I8). |

**No product/React/engine edits.** No gate weakening. Manager `gate` (I9) untouched.

Evidence artifacts (harness dir): `step11b-gate-react-pass.txt`, `step11b-solo-H-R*.txt`, prior `step11-gate-final-probe.txt`.

---

## 3. Kill-switch (I3 + I13)

**`window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2`** — default OFF (fix ON). Harness sets via `REACT_PARITY_GEAR_FIX_OFF=1` → `installBuiltProductBoot` injects `true` before navigation (parent + iframe).

**Probe disambiguation (step 11):** Prior `readParentReactSettings` counted quick-bar DOM as settings-open, so H-R13 appeared PASS even when no `multichart-open-drawing-settings` message fired and no modal opened.

**Switch-OFF result (H-R13 solo):** RED — same as default. Diagnostic: `messageOpen=false`, `quickBarShellOnly=true`, zero postMessage events. **Escalation:** with the honest probe, switch ON also RED on `b88` (dbl-click does not open real settings / no parent message). Individual lane proofs may have run on different build ids; combined `b88` tree does not reproduce settings-open on the harness dbl-click path. I13 revert is not verifiable via H-R13 until product path opens settings on default switches.

---

## 4. Proof — RED → GREEN

### What was “hanging” (step 11b)

| Stale process | PID | Role |
|---------------|-----|------|
| `node serve.mjs` | 43528 | LISTENING on `:8791` from prior run |
| `npm run test:react -- --runs=3` | 45704 | Full all-rows sweep (~7 min/row × 12 × 3) interrupted by user |
| Zombie Chrome | 40044 + 8:08–8:24 PM children | CLOSE_WAIT to stale serve |

**Fix:** `Stop-Process` on stale `serve.mjs` + stuck sweep; restart clean `serve.mjs`; use **`npm run gate:react`** (baseline-aware, 1 run) instead of `--runs=3` full sweep.

**No single scenario hangs solo** — each required row completes in **~35–41s** when serve is healthy.

### Canonical build id

**`20260712b88`** — host + panel-B iframe match (H-R01 L1):

```
{"ok":true,"expectedId":"20260712b88","hostId":"20260712b88","frames":{"B":"20260712b88"}}
```

### Solo row results (`--only=<row> --runs=1`, serve healthy)

| Row | Verdict | Elapsed |
|-----|---------|---------|
| H-R01 | PASS | ~41s |
| H-R04 | FAIL (tracked-red) | ~36s |
| H-R05 | FAIL (tracked-red) | ~36s |
| H-R06 | FAIL (tracked-red) | ~36s |
| H-R07 | PASS | ~36s |
| H-R13 | FAIL (tracked-red) | ~36s |
| H-R14 | FAIL (tracked-red) | ~36s |

Logs: `step11b-solo-H-R*.txt`.

### `gate:react` PASS (baseline-aware)

```
Known failing baseline: H-R04, H-R05, H-R06, H-R08, H-R09, H-R12, H-R13, H-R14
Regressions (not in baseline but failed): (none)
Newly fixed (remove from known-failing): (none)
REACT-GATE H-R01 PASS
REACT-GATE H-R02 PASS
REACT-GATE H-R03 PASS
REACT-GATE H-R07 PASS
REACT-GATE H-R04..H-R06, H-R08, H-R09, H-R12, H-R13, H-R14 FAIL (known-failing)
[react-gate] PASS: no new regressions; 8 known-failing tracked.
```

Full log: `step11b-gate-react-pass.txt`.

### Baseline reconciliation

**Before (step 10, stale):** H-R01, H-R04, H-R05, H-R06, H-R07, H-R08, H-R09, H-R14 (8 rows; H-R13 wrongly omitted after false-green probe).

**After (step 11, honest probe on `b88`):**

```json
["H-R04","H-R05","H-R06","H-R08","H-R09","H-R12","H-R13","H-R14"]
```

**DISCREPANCY vs step 11 prompt expectation** (“only H-R08” or `["H-R07","H-R08","H-R09"]`): actual combined-build failures are **8 rows**. H-R01 and H-R07 are GREEN; H-R12/H-R13 fail with disambiguated probe (quick-bar shell only, no settings message). Do not force the shorter list.

**SHA256 (both trees, byte-identical):** `E50DE996F93175AC0DF0410E2414B2D2F18D5A4B968AD54B8075C872DF32C663`

### CI run URL

**None** — `gh` CLI not available in this environment. Local `gate:react` PASS is pre-merge proof (same steps as `.github/workflows/multichart-harness.yml` `gate-react` job).

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| **I8 (mirror)** | `known-failing.json` + `react-parity-lib.mjs` mirrored; SHA256 match. |
| **I13 (kill-switch)** | `REACT_PARITY_GEAR_FIX_OFF=1` wired; probe disambiguated. H-R13 switch differentiation not proven on `b88` — both ON/OFF RED (escalation). |
| **L1 (build id)** | `20260712b88` on host + panel-B iframe in every solo/gate boot. |
| **L2 (iframe boundary)** | H-R01/H-R12 L1 checks pass (`parentGridInIframe=false`). |
| **D-010 (durable gate)** | `gate:react` on built `dist-v9`, real iframe, 0 regressions. |
| **Integration build** | `MultichartGrid.jsx` contains: `PANEL_SELECTION_CHROME_ROUTING_V3`, `PEER_DESELECT_V1`, `deleteSelectedDrawings`, `dismissActiveDrawingTool`. A3 replay cadence + T4 order-entry family 1 present in chart tree. |

---

## 6. What I did NOT do / limits

- Did **not** run full `--runs=3` all-rows sweep (step 11b: unnecessary; caused the hang).
- Did **not** add per-scenario hard timeouts — isolation showed no row hangs solo; root cause was stale `serve.mjs` + long batch sweep, not an infinite selector wait in one scenario.
- Did **not** trigger GitHub Actions (no `gh`).
- Did **not** change product code — settings-open failures on `b88` with honest probe may reflect combined-tree regression vs individual lane proofs; deferred to authoring lanes.
- H-R02, H-R03, H-R08, H-R09, H-R12 not in step 11b solo list but covered by `gate:react` single pass.

---

## 7. Live-verification handoff

1. Deploy **`20260712b88`** (single canonical id; not partial lane ids).
2. PO: open multichart 2v backtest; confirm build id in panel-B iframe console matches host.
3. Parity checklist rows H-R01 (select), H-R07 (peer isolation) should be GREEN; H-R04–H-R06, H-R08–H-R09, H-R12–H-R14 remain tracked-red until product lanes land fixes on this combined build.

---

## 8. Status

**DONE (proven)** — baseline reconciled, `gate:react` PASS with 0 regressions on built `dist-v9` (`20260712b88`), build id confirmed inside panel iframe, suite unblock documented. **NEEDS-LIVE-CONFIRM** for H-R13 I13 switch proof on combined build (honest probe shows both switch states RED).
