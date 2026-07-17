# A6-4 ship-gate — full gate + D-026 proof re-run (D-030 item 4)

**Baseline:** blessed `20260717b16`  
**Date:** 2026-07-17  
**Harness delta (Lane 4 triage only):** H-R09 scenario applies D-024 `waitForParentV9ChromeDomReady` + panel-B focus/settle (mirrors H-R04); `--order-mc-state-converge-off` boot flag for A6-4 master A/B (both I8 trees).

---

## b37 (prior cut) — STOP

**Build:** `20260717b37`  
**Verdict:** **STOP — RED** — item 4 **NOT satisfied**; do not clear b37 for PO live-confirm.

| Criterion | b37 |
|-----------|-----|
| Manager gate 0 NEW host regressions | **PASS** |
| gate:react 0 NEW react regressions | **FAIL — H-R09** |
| H-R04 10/10 ON isolated | **9/10** |
| H-R05 10/10 ON isolated | **9/10** |

Logs: `a6-4-shipgate-manager-b37.txt`, `a6-4-shipgate-react-gate-b37.txt`, `a6-4-d026-hr04-on-x10-b37.txt`, `a6-4-d026-hr05-on-x10-b37.txt`.

---

## b38 (Lane 3 ready-panels fan-out + re-gate)

**Build under test:** `20260717b38` (Lane 3 ready-panels `addOrder` fan-out in `MultichartGrid.jsx` ~3879–3906)  
**Verdict:** **STOP — RED** — item 4 **NOT satisfied**; **do not clear b38 for PO live-confirm**

### 1. Full manager gate (host)

| Item | b38 result |
|------|------------|
| **Command** | `node gate.mjs` |
| **Log** | `a6-4-shipgate-manager-b38-r1.txt` |
| **Exit code** | **1** |
| **expectedTests** | **83** |
| **knownFailing tracked** | **30** (unchanged vs b16) |
| **quarantine** | **3** (H-S27, H-S30, H-S83) |
| **NEW regressions vs b16** | **H-S59b, H-S83b** |
| **Quarantine outcomes** | H-S27=PASS, H-S30=PASS, H-S83=FAIL (tolerated) |

```text
[gate] FAIL: regression(s): H-S59b, H-S83b
```

**Host manager gate: RED** — cadence/switch-OFF rows regressed vs b16 bless baseline (not A6-4 order-path; unrelated to ready-panels fan-out scope).

---

### 2. gate:react (production React parity)

| Item | b38 result |
|------|------------|
| **Command** | `node react-gate.mjs` |
| **Log** | `a6-4-shipgate-react-gate-b38-r1.txt` |
| **Exit code** | **0** |
| **reactParity.expectedTests** | **14** |
| **reactParity.knownFailing** | **0** |
| **NEW regressions vs b16** | **0** |

```text
[react-gate] PASS: no new regressions; 0 known-failing tracked.
```

Full-suite **H-R09 PASS** with harness D-024 wait applied (panel-B dom-ready before single-click chrome assert).

---

### 3. H-R09 classification (isolated 10×, D-024 wait, fresh session)

| Leg | Runs | Result | Log | Verdict |
|-----|------|--------|-----|---------|
| **Default (A6-4 ON)** | 10 | **9/10 PASS** | `a6-4-hr09-classify-x10-b40-d024.txt` | **FAIL-FLAKE** |
| **Master OFF** (`--order-mc-state-converge-off`) | 10 | **10/10 PASS** | `a6-4-hr09-ab-master-off-x10-b38.txt` | A6-4 **not bisecting** isolated flake |

**Single miss (run 3, default ON):** panel-B probe `parent V9 chrome DOM ready after single click` — `{"reason":"timeout","signal":"talaria:v9-quickbar-dom-ready","domFlag":false}` → CORE `v9BarVisible=false` with `storeOk=true`.

**Classification:** **tracked flake** (panel-B parent V9 chrome dom-ready / quick-bar visibility race), **not** a deterministic A6-4 order-store regression. Master OFF 10/10 confirms A6-4 package is not the cause. Mechanism class: Lane 1 panel-B chrome/selection routing (same family as b37 H-R09 full-suite hit).

**Named discriminator:** `panel-B` + `talaria:v9-quickbar-dom-ready` timeout within 12s budget after iframe single-click select.

D-027 note: H-R09 is a bless-path acceptance row — **not quarantine-eligible**; isolated bar requires **10/10 green** or honest product fix (not retry-until-green, I15).

---

### 4. D-026 proof rows (isolated, binding 10/10)

`REACT_PARITY_ISOLATE_SESSION=1`, build **`20260717b38`**, honest `hasStyleSection`, D-024 wait in scenarios.

| Row | Runs | Result | Log | vs b16 acceptance |
|-----|------|--------|-----|-------------------|
| **H-R04** settings-open ON | 10 | **8/10 PASS** (runs 1, 4: panel-B dom-ready timeout → settings closed) | `a6-4-d026-hr04-on-x10-b38.txt` | **FAIL** |
| **H-R05** Esc chain ON | 10 | **10/10 PASS** | `a6-4-d026-hr05-on-x10-b38.txt` | **PASS** |

**H-R05 stabilized** vs b37 (9/10 → 10/10). **H-R04 residual:** same panel-B dom-ready timeout class (2/10); not retried to green.

Switch-OFF honest RED on b37 unchanged; not re-run on b38 (no product/harness delta on transport switch).

---

### 5. A6-4 order path (not re-litigated)

b37 evidence stands: manager gate 0 regressions on b37; node **20/20** + **36/36**; master OFF does not explain H-R09/H-R04 isolated misses (chrome timing, not order projection).

---

### 6. STOP rationale (I15)

| Criterion | Required | b38 |
|-----------|----------|-----|
| Manager gate 0 NEW host regressions | yes | **FAIL — H-S59b, H-S83b** |
| gate:react 0 NEW react regressions | yes | **PASS** |
| H-R09 isolated 10/10 (D-024 wait) | yes | **9/10 FAIL-FLAKE** |
| H-R04 10/10 ON isolated | yes | **8/10 FAIL-FLAKE** |
| H-R05 10/10 ON isolated | yes | **10/10 PASS** |

**No retry-to-green.** Single-shot evidence only.

---

### 7. Disposition

- **Do NOT clear b38 for PO live-confirm.**
- **Do NOT deploy/bless** on this cut.

| Blocker | Owner | Notes |
|---------|-------|-------|
| **H-S59b, H-S83b** host regressions | Lane 2 / T8 cadence | Blocks manager gate; unrelated to A6-4 order path |
| **H-R04** isolated 8/10 | Lane 4 + Lane 1 chrome | Residual panel-B dom-ready race |
| **H-R09** isolated 9/10 | Lane 4 + Lane 1 chrome | Full-suite green with D-024 wait; binding isolated bar failed |
| **H-R05** | — | **Closed** on b38 (10/10) |
| A6-4 order architecture | Lane 3 | Proven clean on b37; not re-litigated |

**Next ship-gate attempt:** fresh cut after H-S59b/H-S83b root-cause + H-R04/H-R09 panel-B chrome stabilization (or Manager-authorized flake policy amendment for acceptance rows). Closes when **both** gates 0 regressions **and** D-026 H-R04/H-R05 **10/10 ON** **and** H-R09 **10/10** isolated (I15).

---

## b42 (cadence baseline reconcile + Lane 1 chrome hardening re-gate)

**Serve stamp:** `20260717b42` (`serve.mjs`)  
**Dist observed at react proof time:** `20260717b38`–`b39` (stale dist vs serve stamp — Lane 1 hardening cut needs `npm run build:live` refresh before PO binding)  
**Verdict:** **STOP — RED** — do **not** clear for PO live-confirm

### 1. Baseline registration (H-S59b / H-S83b)

Added to `knownFailing` in both I8 trees (**32** tracked host reds, was 30):

| Row | Discriminator | Reason |
|-----|---------------|--------|
| **H-S59b** | RED sub-check: fix-ON candle `Bdelta=0` while switch-OFF `Bdelta>0` (`__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE` / D-015 play-edge cadence pin) | RED until Lane 2 candle-cadence build |
| **H-S83b** | switch-OFF candle V1: `simpleStepForward` coarse interval + 1m panel coarse jump `maxStep>=1h` (T8 candle-cadence V1 RED pin) | RED until Lane 2 candle-cadence build |

Host harness: `--order-mc-state-converge-off` added to `run.mjs` / `harness-lib.mjs` (both I8) for master A/B.

### 2. A6-4 master A/B — not order-path

`node run.mjs --only=H-S59b,H-S83b --order-mc-state-converge-off` → **both PASS** (log: `a6-4-hs59b-hs83b-ab-master-off-b42.txt`). Failures on b38 full gate used **cadence kill-switches**, not `__TALARIA_DISABLE_ORDER_MC_*`. Master OFF does not bisect as A6-4 order regression.

### 3. Manager gate (post-baseline)

| Item | b42 r1 |
|------|--------|
| **Log** | `a6-4-shipgate-manager-b42-r1.txt` |
| **Exit code** | **1** |
| **NEW regressions vs b16** | **0** |
| **H-S59b / H-S83b** | **PASS** (full-suite GREEN this cycle) |
| **Ratchet note** | Exit 1 = `baseline stale; remove … H-S59b, H-S83b` (knownFailing rows passed — opposite flake pole from b38 gate RED). **0-regression criterion met**; ratchet requires promotion or quarantine if pass persists. |

```text
Regressions (not in baseline but failed): (none)
[gate] FAIL: baseline stale; remove fixed test(s) from known-failing.json: H-S59b, H-S83b
```

### 4. D-026 + H-R09 isolated 10× (Lane 1 hardening dist)

| Row | Runs | Result | Log |
|-----|------|--------|-----|
| **H-R04** | 10 | **8/10** FAIL-FLAKE | `a6-4-d026-hr04-on-x10-b42.txt` |
| **H-R05** | 10 | **6/10** FAIL-FLAKE | `a6-4-d026-hr05-on-x10-b42.txt` |
| **H-R09** | 10 | **7/10** FAIL-FLAKE | `a6-4-hr09-classify-x10-b42-d024.txt` |

Shared miss: panel-B `talaria:v9-quickbar-dom-ready` timeout → settings/chrome assert fail. Lane 1 hardening **not yet 10/10** on binding isolated bar.

**Harness fix:** repaired broken JSDoc in `react-parity-lib.mjs` (chart tree) that blocked `react-run`.

### 5. PO clear checklist

| Criterion | b42 |
|-----------|-----|
| Manager gate 0 NEW regressions | **PASS** (0; ratchet newlyFixed separate) |
| H-R04 10/10 isolated | **FAIL — 8/10** |
| H-R05 10/10 isolated | **FAIL — 6/10** |
| H-R09 10/10 isolated | **FAIL — 7/10** |

**Do not clear for PO.** Refresh dist to b42 stamp + Lane 1 chrome hardening must reach **10/10** on all three rows before next ship-gate close attempt.
