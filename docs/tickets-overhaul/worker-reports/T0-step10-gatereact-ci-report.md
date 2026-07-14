# T0 step 10 — wire `gate:react` into CI

## 1. Task + RC

**Task:** T0 step 10 (Lane 4) — wire the real-iframe parity gate (`npm run gate:react`, built `dist-v9` + puppeteer multi-frame) into GitHub Actions so the iframe-fix family cannot regress silently.

**RC:** Tooling/diagnostic — no RC. Enforces D-010 durable gate surface in CI (separate from manager `gate` / I9).

## 2. What I changed — file by file

| Path | Change |
|------|--------|
| `.github/workflows/multichart-harness.yml` | Added separate job `gate-react` (build `dist-v9` via `talaria-design` `npm run build:live`, harness `npm ci`, `npm run gate:react`). Expanded PR path filters for harness + `vite.config.live.js`. Existing `gate` job unchanged (I9 ratchet preserved). |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | Added `currentReactBuildId()` — re-reads build id from `dist-v9/index.html` at each boot/assert so L1 checks stay stable when dist bumps between local runs (CI builds once, then gates). |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Synced `reactParity.knownFailing` to **8 tracked-red** rows; removed **H-R13** (now GREEN on current build). |
| `chart v 1.4/chart/multichart-prod/harness/react-gate-ci-evidence.txt` | Local gate log captured for this step (proof artifact). |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | Byte-identical mirror of canonical baseline. |
| `homepage/public/chart/multichart-prod/harness/react-parity-lib.mjs` | Byte-identical mirror of `currentReactBuildId()` fix. |

**No product/React/engine edits.** No new npm dependencies or third-party GitHub Actions beyond existing pinned `actions/checkout@v4` and `actions/setup-node@v4`.

## 3. Kill-switch (I3 + I13)

**N/A — CI/workflow + harness baseline only.** Gate runs with production-default switches (no `REACT_PARITY_GEAR_FIX_OFF`).

## 4. Proof — RED → GREEN

### Before (step 10 start)

- `gate:react` ran **local fast-loop only** (step 8b/9 reports: “CI wiring deferred”).
- Baseline drift caused local gate failure (`H-R13` newly GREEN but still listed in `knownFailing`; stale `REACT_BUILD_ID` constant broke H-R12 L1 when dist bumped mid-run).

### After

**Workflow** (`.github/workflows/multichart-harness.yml`):

```yaml
jobs:
  gate:          # unchanged — npm run gate (I9)
  gate-react:    # NEW — build:live + npm run gate:react
```

**Local proof (equivalent to CI job steps):**

```powershell
cd "chart v 1.4/talaria-design"
npm ci && npm run build:live

cd "../chart/multichart-prod/harness"
npm ci
npm run gate:react
```

**GREEN evidence** (`react-gate-ci-evidence.txt`):

```
[react-gate] PASS: no new regressions; 8 known-failing tracked.
REACT-GATE H-R02 PASS
REACT-GATE H-R03 PASS
REACT-GATE H-R12 PASS
REACT-GATE H-R13 PASS
REACT-GATE H-R01 FAIL (known-failing)
… H-R04..H-R09, H-R14 FAIL (known-failing)
```

**Tracked-red baseline enforced (failure threshold):**

| ID | In baseline | Gate result |
|----|-------------|-------------|
| H-R01 | yes | FAIL (allowed) |
| H-R02 | no | PASS (required) |
| H-R03 | no | PASS (required) |
| H-R04–H-R09 | yes | FAIL (allowed) |
| H-R12 | no | PASS (required) |
| H-R13 | no | PASS (required — newly fixed, removed from baseline) |
| H-R14 | yes | FAIL (allowed) |

Any **new** red outside this set fails the job (`regressions` in `react-gate.mjs`).

### CI run link

`gh` CLI not available in this environment; workflow will run on the next PR touching `chart v 1.4/chart/**`, harness files, or `multichart-harness.yml`. Trigger manually via **Actions → Multichart harness → Run workflow**.

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| **I9** | Manager `gate` job untouched; separate `gate-react` job and ratchet (`reactParity` section only). |
| **D-010** | CI builds real `dist-v9`, harness auto-starts `serve.mjs`, asserts build id inside panel-B iframe (existing L1 checks). |
| **Security** | No new external actions; pinned `checkout@v4` / `setup-node@v4`; puppeteer uses existing `--no-sandbox` args for headless Ubuntu. |
| **L1** | `currentReactBuildId()` fresh read per scenario boot. |

## 6. What I did NOT do / limits

- **No GitHub Actions run URL** captured here (requires push/PR + `gh`); local `react-gate-ci-evidence.txt` is the pre-merge proof.
- **Did not merge** `gate` and `gate:react` into one job (explicitly separate per prompt).
- **H-R13** flipped GREEN on current local build — removed from baseline; if it regresses on CI, gate will fail as a new regression (intended).
- **Job timeout** set to 30 minutes; full suite ~7 minutes locally.

## 7. Live-verification handoff

After merge, open any PR that touches multichart harness paths → confirm **Multichart harness / react parity gate (real iframe)** job is green. On failure, inspect log for `Regressions (not in baseline but failed):` — only IDs **not** in `reactParity.knownFailing` block merge.

## 8. Status

**DONE (proven)** — workflow committed; local `npm run gate:react` PASS with 8-row tracked-red baseline matching step-9 HR-PARITY defects + H-R14; H-R12/H-R13 GREEN; manager I9 gate job unchanged.
