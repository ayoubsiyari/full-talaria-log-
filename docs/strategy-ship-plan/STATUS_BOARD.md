# Status Board — Strategy Ship-Ready Effort

> Maintained by the **Manager only**. Updated after every verification, gate, ICR event,
> and escalation. Workers and Director read; Manager writes.

- **Current phase:** 2 (High-severity correctness) — Phase 1 CLOSED (gate passed; see reports/MANAGER/PHASE1_GATE.md)
- **Last updated:** 2026-07-09 — **C1 rework VERIFIED; all 6 Phase-1 tasks code-complete. Phase 1 GATE in progress.**
- **Phase 1 gate plan (Director-approved):** demo-mode runtime checks now (B1, C1, D1, A3) via vite prototype at http://localhost:5173/talaria-v16-design/ + static verification of A1/A2/A6. **A1/A2/A6 LIVE runtime deferred to Phase 4** (full 7-service Docker stack; run during final double-regression). Demo checks pending user execution in browser.
- **🚨 CLOBBER INCIDENT:** C1's edits (all in-zone, correct per report) were fully overwritten by a concurrent full-file save from another worker on the shared `TalariaV16.jsx`. Grep confirms 0 of C1's symbols present; A/B/D edits survived. Root cause = the serialization slip (workers saved the 58k-line file concurrently, last-write-wins). **Mitigation:** C re-applies under EXCLUSIVE file lock (`prompts/P1_WORKER_C_REWORK.md`); no other worker may save `TalariaV16.jsx` until C re-lands and Manager verifies.
- **Coexistence check (Manager-verified in live tree):** A's `strategyDeleteInFlightRef`@11803, A's bank effect@11822–11854, A's boot merge@~11246, B's `openAppConfirm`@46878 — all intact after D1.
- **Working model (Director-confirmed):** SHARED main tree, **serialized editing** — only ONE worker edits `TalariaV16.jsx` at a time. Manager sequences handoffs: worker edits → returns file + report → Manager verifies → Manager releases next worker. No two workers touch the file concurrently.
- **Zone policy (Director-confirmed):** pragmatic — an out-of-zone hunk that is correct and coexists is accepted, formalized as a retroactive ICR, and the worker is warned. Repeated/breaking breaches escalate to REWORK.
- **Phase 1 editing order:** A ✅ done → **D1 (in progress)** → **C1** → **B1**. (Zones are disjoint so order is flexible; this sequence respects that D already began and keeps C/B clean.)
- **Open escalations:** none
- **Director decisions:** D-1 ☑ (a) strip/flag · D-2 ☑ (a) accept connectors · D-3 ☑ (a) client-side only
- **Isolation model:** each worker in its own git worktree/branch; Manager integrates in order C → B → D → A with mini-smoke between each. Manager hands each worker a self-contained prompt in `prompts/`; workers return a filled task report.
- **Phase 1 prompts issued:** `prompts/P1_WORKER_A.md`, `P1_WORKER_B.md`, `P1_WORKER_C.md`, `P1_WORKER_D.md`.
- **🚫 BRANCH DIRECTIVE (all workers):** DO NOT `git checkout`/switch branches or `git stash`. All work lives as UNCOMMITTED changes on whatever checkout is active (currently `ship/worker-a`). Switching branches either clobbers the file or is blocked — either way it's pure risk. Stay on the current checkout; only Manager coordinates any git branch/commit actions.
- **ICR-5/ICR-6:** CLOSED — Worker D added coexistence acknowledgement to D1.md; Manager re-verified tree intact.
- **⚠ Phase 2 D task NOT done:** Worker D only did the documentary ICR-5/6 ack (ran old P1 prompt). ICR-2/ICR-3 implementation + ICR-4 still owed → re-dispatch `P2_WORKER_D.md`.
- **Shared confirm-copy lock (A3 ↔ B1):** use existing `openAppConfirm`; cancel action = "Keep editing"; destructive action verb = "Discard" (B1 close) / "Replace" (A3 template); same tone/mechanism. Workers must report the exact call used.

## Task tracker

| Task | Worker | Phase | Status | Report | Manager verdict | Notes |
|---|---|---|---|---|---|---|
| M0.1 board + access | Manager | 0 | DONE | — | self | board live, zones assigned |
| M0.2 baseline run | Manager | 0 | DEFERRED | reports/MANAGER/BASELINE.md | — | to run at integration (env not yet booted) |
| M0.3 confirm D-1/D-2 | Manager | 0 | DONE | — | self | D-1/D-2/D-3 all (a) confirmed by Director |
| A1 merge-drop fix | A | 1 | VERIFIED (static) | reports/A/A1.md | ✔ zone breach→ICR-5; runtime deferred to gate | flag contract defined |
| A2 pessimistic delete | A | 1 | VERIFIED (static) | reports/A/A2.md | ✔ zone breach→ICR-6; runtime deferred to gate | double-fire guard ok |
| A3 template-vs-edit confirm | A | 1 | VERIFIED (static) | reports/A/A3.md | ✔ in-zone; copy lock ok, reconcile w/ B1 | runtime deferred to gate |
| B1 close confirm | B | 1 | VERIFIED (static) | reports/B/B1.md | ✔ copy lock ok; zone breach→ICR-7; runtime deferred | Arabic parity → B5 |
| C1 undo seeding | C | 1 | VERIFIED (static) | reports/C/C1.md | ✔ re-applied under lock; edits confirmed present; runtime deferred | clobber resolved |
| D1 community strip/flag | D | 1 | VERIFIED (static) | reports/D/D1.md | ✔ zone ok; coexists w/ A+B; click-crawl deferred | — |
| — PHASE 1 GATE — | Manager | 1 | PASSED | reports/MANAGER/PHASE1_GATE.md | ✔ demo runtime + static; A1/A2/A6 live→P4 | CLOSED |
| A4 payload budget | A | 2 | DONE (verified) | reports/A/A4.md | ✔ img+payload guards pre-persist (46635-46647) | |
| A5 root conditions + tree | A | 2 | DONE (verified) | reports/A/A5.md | ✔ canvas→root conditions + tree restore | custom-TF: stratBTfCustom authoritative |
| A6 fetch-fail surfacing | A | 2 | DONE (verified); runtime→P4 | reports/A/A6.md | ✔ rework isolates strategies fail (strategyBankError field); journal survives | 401/500 browser sim in P4 |
| A ICR-1/ICR-4/skipConfirm | A | 2 | DONE (verified) | reports/A/A5.md | ✔ TF backstop, markets precedence, skipConfirm param | D one-liner pending |
| B2 TF cap + case | B | 2 | VERIFIED (static) | reports/B/B2.md | ✔ canonicalize+dedupe+gating; ICR-1 filed | runtime→gate |
| B3 instrument grids | B | 2 | VERIFIED (static) | reports/B/B3.md | ✔ wrapping grids + at-cap feedback | runtime→gate |
| B4 edit restoration | B | 2 | DONE (verified); runtime→P4 | reports/B/B4.md | ✔ lifted stratBTfCustom sole state; manual-ref guards markets; step-1 restore | UI restore check in P4 |
| C2 template overwrite guard | C | 2 | VERIFIED (static) | reports/C/C2.md | ✔ predicate+modal routing; dead picker removed; ICR-3 filed | combined behavior pending ICR-3 |
| D2 markets restore (verify) | D | 2 | DONE (static); runtime→P4 | reports/D/D2.md | ✔ picker 2-liner wired (47114-47118), ICR-4 static ok | UI click-crawl in P4 batch |
| — PHASE 2 GATE — | Manager | 2 | PASSED (static) | reports/MANAGER/PHASE2_GATE.md | ✔ lint+tsc clean; live-runtime→P4 | CLOSED |
| C3 canvas UX batch | C | 3 | DONE (verified); runtime→P4 | reports/C/C3.md | ✔ dead code 0-refs, onConnect gone/edges render, img parity, lint clean | |
| C4 PDF polish | C | 3 | DONE (verified); runtime→P4 | reports/C/C4.md | ✔ preflight before window.open (5246-5256); escPrint intact | |
| B5 feedback & caps | B | 3 | ASSIGNED (serial #2) | reports/B/B5.md | prompt P3_WORKER_B | file now free |
| D3 sort/filter honesty | D | 3 | QUEUED (serial #3) | reports/D/D3.md | prompt P3_WORKER_D | defaults: remove fake sorts, badge=real rows |
| D4 dead-code sweep | D | 3 | QUEUED (serial #3) | reports/D/D4.md | prompt P3_WORKER_D | keep community plumbing |
| A7 name normalization | A | 3 | QUEUED (serial #4) | reports/A/A7.md | prompt P3_WORKER_A | D-3 client-side only |
| — PHASE 3 GATE — | Manager | 3 | TODO | reports/MANAGER/PHASE3_GATE.md | — | |
| M4.1 integrate + regress ×2 | Manager | 4 | TODO | — | — | merge order C→B→D→A |
| A/B/C/D PHASE4_VERIFY | All | 4 | TODO | reports/*/PHASE4_VERIFY.md | — | |
| M4.3 final ship report | Manager | 4 | TODO | reports/MANAGER/FINAL_SHIP_REPORT.md | — | Director sign-off |

## ICR tracker

| ICR | From→To | Related task | Status | File |
|---|---|---|---|---|
| ICR-1 saveBuilder TF guard | B→A | B2 | FILED → routed to A (implement on A's turn) | reports/B/ICR-1.md |
| ICR-2 lifted TF/market state | B→D | B4 | IMPLEMENTED by D (stratBTfCustom@12156, manualRef@12140, props@47004/47006) | reports/B/ICR-2.md |
| ICR-3 hasExistingGroups prop | C→D | C2 | IMPLEMENTED by D (@46984); combined+double-confirm pending A | reports/C/ICR-3.md |
| ICR-3-rider double-confirm fix | C/D→A | C2×A3 | DONE — A param@46278 + D call-site@47114-47118 (skipConfirm=true, predicate broadened) | reports/C/C2.md |
| ICR-4 openBuilder markets | D→A | D2 | IMPLEMENTED by A (46354-46356) → unblocks D2 | reports/D/ICR-4.md |
| ICR-1 saveBuilder TF backstop | B→A | A5 | IMPLEMENTED by A (46597-46620) | reports/B/ICR-1.md |
| custom-TF state dup | note | B4/A | RESOLVED — consolidated on lifted stratBTfCustom; no sbTfCustom/setSbTfCustom refs remain | — |
| ICR-5 A1 consumer wiring in D zone | A→D | A1 | VERIFIED (coexists w/ D1) | reports/A/ICR-5.md |
| ICR-6 delete in-flight ref in D zone | A→D | A2 | VERIFIED (coexists w/ D1) | reports/A/ICR-6.md |
| ICR-7 openAppConfirm prop at modal instantiation | B→D | B1 | VERIFIED (coexists w/ D1) | reports/B/ICR-7.md |

## Gate log

| Gate | Date | Result | Notes |
|---|---|---|---|
| Baseline | — | — | |
