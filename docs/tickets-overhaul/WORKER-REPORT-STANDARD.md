# Worker Report Standard (mandatory — every worker, every task)

**Why this exists:** workers now run on Composer 2.5, which reports more tersely than the previous model. Terse reports hide gaps — untested paths, skipped invariants, "green" that was never really proven. **Every worker report MUST fill in every section below.** A report missing any section is returned unaccepted; the Manager will not close the task on it.

Put the completed report at `docs/tickets-overhaul/worker-reports/<task-id>-report.md`. Do **not** shorten or omit sections — write "N/A — <reason>" if a section truly doesn't apply.

---

## Required sections

### 1. Task + RC
- Task id and one-line goal.
- Which root cause (RC-1…RC-8) this discharges, or "tooling/diagnostic — no RC".

### 2. What I changed — file by file
For **every** file touched: full path, and 1–3 lines on *what* changed and *why*. If you touched a mirrored tree (e.g. `chart v 1.4/...` **and** `homepage/public/chart/...` **and** `talaria-design/...`), list **all** copies — they must stay byte-identical (P-invariant). State explicitly: "no other files touched."

### 3. Kill-switch (I3 + I13)
- Switch name (`window.__TALARIA_*`), default state.
- **Every file the switch must gate** — including React/JSX and any iframe/engine file. Confirm switch OFF fully reverts to prior behavior in **each** file.
- If any code path is ungatable, say so explicitly and why (I13 requires callout + real-product verification).

### 4. Proof — RED → GREEN
- The exact command(s) run and where (fast loop / harness / gate / node property test).
- RED evidence (the failing state before the fix) and GREEN evidence (after). Paste the key lines or attach the evidence file path.
- **Determinism:** for any timing-sensitive fix, report pass count over repeated runs (e.g. "10/10"). A green that needs an artificial fixed `sleep()` to pass = RED; say what signal you gated on instead.
- Gate result (scenario counts, regressions, tracked-red list) if the gate was run.

### 5. Invariants checked
- List each relevant invariant (I1–I13, L1–L2) and how you satisfied it. Call out any you could NOT satisfy.

### 6. What I did NOT do / limits
- Paths you did not test, edge cases left open, assumptions made, anything deferred. Be explicit — this is the section that prevents silent gaps.

### 7. Live-verification handoff
- Exact steps for the PO to confirm on the real product (build id to look for, panel setup, the click sequence), or "already covered by parity checklist row N".

### 8. Status
- One of: **DONE (proven)** / **NEEDS-LIVE-CONFIRM** / **BLOCKED (reason)** / **DIAGNOSTIC-ONLY (mechanism reported, fix not started)**.

---

**Manager check on intake:** if sections 2, 4, or 6 are one-liners with no specifics, bounce the report and ask for the missing detail before accepting. Do not infer success from a short "done".
