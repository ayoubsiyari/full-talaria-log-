# T3 — verify-only pass spec (P2/P3/P6 + P4-Esc) report

## 1. Task + RC

- **Task:** `T3-verify-only-spec-lane3-P2P3P6-D021.md` — read-only verify-pass spec for P2/P3/P6 (+ P4-Esc) on combined build (anti-idle while H-R06/H-R07 implement).
- **RC:** **RC-1 + RC-4** (multichart interaction re-migration). Tooling/spec only — no mechanism discharge.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `docs/tickets-overhaul/T3-VERIFY-ONLY-PASS-SPEC.md` | **New.** Per-row I15 assertions: actuation helpers, end-states, 10/10 determinism, failure signatures, D-021 12-row cross-check, combined-build dependencies, re-escalation protocol. |
| `docs/tickets-overhaul/worker-reports/T3-verify-only-spec-report.md` | **New.** This report. |

**No product, harness, registry, or `react-parity-lib.mjs` edits.**

---

## 3. Kill-switch (I3 + I13)

**N/A — read-only spec.** Verify runs assume combined-build defaults (migration fixes ON). Documented in spec §0:

- Verify bundle: **no** `--phase1-off`
- Implement gates (H-R06/H-R07) retain their own switches per D-021 / phase prompts
- PO checklist row **11** still required for revertibility proof at unfreeze

---

## 4. Proof — RED → GREEN

**N/A — no fix landed, no harness executed.**

Spec defines future proof commands:

```bash
cd "chart v 1.4/chart/multichart-prod/harness"
node react-run.mjs --runs=10 --only=H-R01,H-R04,H-R05,H-R08,H-R09,H-R13,H-R14
```

Full 12-row gate (post H-R06/H-R07):

```bash
node react-run.mjs --runs=10 --only=H-R01,H-R02,H-R03,H-R04,H-R05,H-R06,H-R07,H-R08,H-R09,H-R12,H-R13,H-R14
```

**I15:** Each row in spec names real actuation (`page.mouse`, `page.keyboard`) and store/modal end-states — not proxy greens.

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| **I15** | Every verify row documents actuation helper + CORE end-state; invalid proxies listed |
| **D-021 #2** | P2/P3/P6 + P4-Esc rows fully specified |
| **D-021 #3** | §2 maps all 12 rows — H-R12 explicitly included in full gate; none dropped |
| **Read-only guardrail** | No product/harness/registry edits |
| **Anti-idle** | Spec runnable immediately on combined cut without waiting for implement lanes |

---

## 6. What I did NOT do / limits

- Did not run `react-run` or `gate:react` — spec only.
- Did not update `known-failing.json` or `T3-COMBINED-BUILD-MANIFEST.md` (Lane 2 owns manifest).
- H-R12 added to full-gate command but not verify-only subset (dropped-green; still matrix-required).
- Full-suite flake notes (H-R04/H-R09) documented; isolated 10/10 is the verify bar per frozen matrix.
- PO live-confirm steps referenced but not executed.

---

## 7. Live-verification handoff

When combined build cuts:

1. Record `BUILD_ID` from `dist-v9` / host + panel B iframe (`window.__TALARIA_CHART_BUILD_ID`).
2. Run verify bundle (§0 of `T3-VERIFY-ONLY-PASS-SPEC.md`) — **10/10** on all seven scenarios.
3. After H-R06/H-R07 land, run full 12-row command.
4. PO: `MULTICHART-PARITY-CHECKLIST.md` rows 1, 4, 5, 8, 9 (+ 9b) on **same** build id.

Any verify-only fail → capture log + re-escalate per spec §4 (phase returns to fix-scope).

---

## 8. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)** — spec delivered; harness proof pending combined build cut.

Lane 3 verify-only anti-idle item **complete**; Lane 3 pauses per freeze-safe backlog exhaustion (A6-4 / A6-3 chart-half deferred post-re-migration).
