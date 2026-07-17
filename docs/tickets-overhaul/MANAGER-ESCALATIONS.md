# Manager Escalations — Tickets Overhaul (Plan 2)

Escalations to the Director only. Routine progress → `MANAGER-FINDINGS.md`.

---

## ESC-021 — verify-only rows H-R04 (settings) + H-R05 (Esc) fail as a REAL panel-B chrome-readiness race on the combined build (D-021 fresh-escalation trigger)

**Date:** 2026-07-16 · **Filed by:** Manager · **Track:** T3 / RC-1+RC-4 (re-migration) — P3 settings + Esc leg · **Status:** ✅ RESOLVED by **D-024** — fix AUTHORIZED. One small gated Lane 1 fix (emit ready-signal only after DOM commit + gate selection handler, own switch `__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4`, scope fenced to readiness ordering only — transport untouched). Acceptance: H-R04+H-R05 10/10 ON / 10/10 FAIL switch-OFF (discriminator from birth), then 3 consecutive clean gate:react → bless. **Ready-signal becomes the harness wait primitive** (Lane 4 awaits product's truthful "chrome ready" event, retires tuned timeouts). Historical "settings only opens on 2nd/double click" tester tickets → retest on combined build (likely same root).

### What happened (honest isolation, fresh browser per run, build `20260716b10`)
After Lane 4 fixed the shared-browser flake (`REACT_PARITY_ISOLATE_SESSION=1`), strict isolated ×10:
| Row | Isolated result | Meaning |
|-----|-----------------|---------|
| H-R01 (chrome-on-select) | **10/10 PASS** | was suite-order noise — now clean |
| H-R12 (gear route) | **10/10 PASS** | was suite-order noise — now clean |
| **H-R04 (settings dbl-click)** | **1/10 PASS** | **REAL race** — panel B settings `open=false` after real dbl-click |
| **H-R05 (Esc close)** | **7/10 PASS** | **REAL race** — settings not reliably open before Esc |

H-R04/H-R05 flake with a **fresh browser per run** → not suite-order; a genuine **panel-B iframe → parent settings-routing readiness race**. Evidence: `pbcr-hr04-x10.txt`, `pbcr-hr05-x10.txt`. Worker 4 correctly STOPPED (did not mask with sleeps/retries — I15).

### Root cause (Lane 1 read-only diagnostic)
`T3-panelB-chrome-readiness-race-diagnostic-report.md`: parent chrome signals "gear/settings ready" **before the DOM is committed/bound**, so a dbl-click / Esc arriving in that window no-ops. Non-deterministic by message-round-trip + effect ordering.

### Why this is a Director item (not a silent fix)
D-021 re-scoped P2/P3/P6 to **verify-only** ("no new code, no new switches; if a verify pass fails there, it comes back as a fresh escalation with evidence"). H-R04 is a P3 verify row failing for real → the D-021 contingency fires. H-R05 (Esc) was treated as a secondary flake, now proven a real race in the same root. So this needs authorization to add code+switch, which verify-only forbids by default.

### Manager recommendation
Authorize a **single small gated Lane 1 fix** for both rows (one root): emit **gear/settings-ready after DOM commit** in `TalariaV8bLive.jsx` + gate the manager selection handler, behind new switch **`__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4`** (unset = fix ON). Acceptance: H-R04 + H-R05 → **10/10 PASS isolated**, switch-OFF → **10/10 FAIL** (named discriminator per D-023), then Lane 4 re-runs STEP 1 isolation → 3-consecutive-clean `gate:react` → bless. This also gives Lane 4 a real "chrome ready" signal to await (replacing timeout-based waits).

### Manager actions already taken (no ruling needed)
- Bless of `20260716b10` **held** — not parity-ready until H-R04/H-R05 genuinely green.
- Lane 1 fix **held** pending this ruling (D-021 requires the escalation first); Lane 4 STEP 2/3 held behind it.
- No sleeps/retry-masking applied (I15).

---

## ESC-021 — RESOLVED

**Director ruling:** D-024 (2026-07-16)  
**Outcome:** **AUTHORIZED** — P3 (+ Esc verify leg) converts verify-only → fix-scope for the one root (chrome advertises readiness before DOM commit/handler binding). One small gated Lane 1 fix as recommended: ready-signal emitted after DOM commit + gated manager selection handler, behind `__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4`. **Scope fence: readiness ordering only** — no settings-transport changes. Acceptance: H-R04 + H-R05 10/10 isolated, switch-OFF 10/10 FAIL (named discriminator from birth per D-023), Lane 4 STEP-1 re-run, 3 consecutive clean `gate:react` → bless. **Ratified: the ready-signal becomes the harness wait primitive** (Lane 4 replaces timeout waits with awaiting the real signal — races become deterministic assertions). Ledger note: this race likely explains the historical "settings needs double-click/second try" ticket family — those registry rows go to retest on the combined build once green, not separate fixes. Bless sequence: this fix + H-R02 discriminator (D-023) + H-S27/H-S83 triage + gate green → PO parity checklist.

---

## ESC-020 — D-021 condition #1 (Phase-1 A/B honesty gate) is now obsolete for H-R03/H-R02; propose dedupe A/B as replacement discriminator

**Date:** 2026-07-16 · **Filed by:** Manager · **Track:** T3 / RC-1+RC-4 (re-migration) + T0 (harness honesty) · **Status:** ✅ RESOLVED by **D-023** — dedupe A/B accepted as H-R03 discriminator of record; **H-R02 needs its own re-derived discriminator BEFORE bless** (Lane 4, small); P1 stays committed+gated with honest ledger note that its load-bearing role for these 2 rows is now unproven (retiring it = fresh escalation w/ evidence). D-021 condition updated not retired: every trusted row carries a named discriminator that provably flips it red; discriminator moves with the mechanism via escalation. Bless path: H-R02 discriminator + H-S27/H-S83 triage + one more clean 10/10 (host-side flake gets its own tracked row if it recurs — no flake labels).

### What happened
The H-R03 fix (`ecaa8a9c` — iframe ctrl-select dedupe + DOM-pointer resolution `_resolveDrawingFromDomPoint`) is a **more complete selection mechanism** than the Phase-1 engine-selection substrate. On combined build `20260716b10`, Lane 4's assembly gate found:
- **Criterion 1 (dedupe A/B) — PASS/honest:** H-R03 `--runs=10` → 10/10 PASS (r2; 1 host-only flake on r1, panel B 10/10); `--iframe-ctrl-dedupe-off` → **10/10 FAIL-REAL-BUG**. The dedupe switch is a genuine, discriminating one-knob revert.
- **Criterion 4 (Phase-1 A/B) — now stale:** `--phase1-off` → **H-R02 10/10 PASS and H-R03 10/10 PASS** (both were expected to FAIL). The P1 substrate is no longer the load-bearing path for these two rows — `ecaa8a9c`'s DOM-pointer resolution covers selection independently.

### Why this is a Director call
D-021 condition #1 explicitly froze the harness and made the **Phase-1 A/B the harness's own regression test** — "any future actuation change must re-run the Phase-1 A/B discriminator before its results are trusted." `ecaa8a9c` is exactly such a change, and it has **retired the P1-off discriminator's power for H-R02/H-R03**. Silently swapping the honesty gate is precisely the move the plan forbids, so it comes to you.

### Two questions
1. **Discriminator replacement:** Approve the **dedupe A/B** (`--iframe-ctrl-dedupe-off` → 10/10 FAIL) as the honest discriminator of record for H-R03, replacing the now-obsolete `--phase1-off` leg for that row. (H-R03 is provably not blanket-green.)
2. **Is P1 still load-bearing?** Since `--phase1-off` no longer flips H-R02/H-R03, either (a) `ecaa8a9c` legitimately subsumes P1's role for these rows and P1 stays as defense-in-depth (committed, gated), or (b) P1 is now dead code for these rows and we need a fresh discriminator for **H-R02** specifically (it has no dedupe-equivalent A/B). Manager's read is (a) — the engine substrate still owns non-ctrl selection routing that the harness rows don't isolate — but this needs your call on whether H-R02 needs its own re-derived discriminator before bless.

### Manager recommendation
- Accept dedupe A/B as the H-R03 discriminator (criterion 4 satisfied for H-R03 via criterion 1).
- Keep P1 committed + gated (defense-in-depth); if you want a hard H-R02 discriminator, Lane 4 re-derives one before bless (small).
- Criterion 5 (H-S27/H-S83) is a separate triage already dispatched — not part of this ruling.

### Manager actions already taken (no ruling needed for these)
- **STOP on bless** — `20260716b10` held; unfreeze does not lift until criterion 4 (this ruling) + criterion 5 (triage) clear.
- **Lane 2 triage dispatched** for H-S27/H-S83 (real regression vs full-suite flake).
- Lane 4 holds baseline promotion (H-R07 removal, H-S34) until both clear.

---

## ESC-020 — RESOLVED

**Director ruling:** D-023 (2026-07-16)  
**Outcome:** (1) **Dedupe A/B accepted as H-R03's discriminator of record** (`--iframe-ctrl-dedupe-off` → 10/10 FAIL isolates the exact fixed mechanism; stronger than the Phase-1 leg). D-021's condition is **updated, not retired**: every trusted row carries a named discriminator that provably flips it red; when a mechanism change moves the load, the discriminator moves with it **via escalation, never silently** — this case is the worked example. (2) **H-R02 needs its own re-derived discriminator BEFORE bless** — the Phase-1 anchor is retired for it and an undiscriminated green on the bless-critical path violates I15; Lane 4 derives a small targeted discriminator (provably breaks single-select store commit → H-R02 10/10 FAIL). Only new work this ruling adds. (3) **P1 stays committed + gated as defense-in-depth**, with an honest ledger note that its harness-visible load-bearing role for H-R02/H-R03 is now unproven; retiring P1 later = fresh escalation with discriminator evidence, not housekeeping. (4) **Bless sequence:** H-R02 discriminator + criterion-5 triage + gate green with one more 10/10 on the bless candidate (r1 host-only flake: one recurrence = own tracked row per D-022). Baseline promotions ride the gate-green commit.

---

## ESC-019 — H-R03 panel-B ctrl-select REGRESSION on combined build; kill-switches don't isolate it (possible I13 gap)

**Date:** 2026-07-16 · **Filed by:** Manager · **Track:** T3 / RC-1+RC-4 (re-migration) · **Status:** OPEN — informational + flag; Manager already dispatching diagnostic/fix. No ruling blocks the fix; a ruling is only needed if the fix requires scope/architecture change.

### What happened
Combined build `20260716b6` (P1 `6dc552a8` + H-R06 `f46e6d9d` + H-R07 `52894a8d` + harness reconcile `ba07584c`) fails the assembly gate. Lane 4's isolated fresh-boot verification (authoritative per D-018 Phase 0):
- **H-R03 (panel-B ctrl multi-select): 10/10 FAIL-REAL-BUG** (host 10/10 PASS). Was **10/10 GREEN** on `20260715b2` pre-H-R06 → **genuine regression**, not session flake.
- H-R06 10/10 PASS, H-R07 10/10 PASS (both engine rows individually fine). H-R04/H-R05 panel-B are secondary flakes behind the H-R03 block.

### The concerning part (discipline)
**No kill-switch restores panel-B ctrl-select:** `--phase1-off`, `--phase5-off`, `--peer-deselect-off`, `--panel-keyboard-off` all still 10/10 FAIL. Since flipping every relevant master OFF does not revert the behavior, the regression rides an **ungated code path** — a likely **I13 violation** (a fix's kill-switch must cover every file/path it touches). This is the real issue: not just "a row broke," but "a change shipped that our one-knob reverts can't undo."

### Contributing process factor
The **one-phase-per-PR on `MultichartGrid.jsx` rule was violated**: P4 (Delete) and P5 (peer-isolation) hunks were both on disk in the shared working tree and got **bundled into a single commit `f46e6d9d`** (Worker 1's H-R06 land), so P4/P5 could not be committed or reverted independently. This is why the switch-level bisect is inconclusive.

### Manager actions already taken (no ruling needed to proceed)
- **STOP on bless** — combined build NOT parity-checklist ready; unfreeze holds.
- **Lane 4 held** H-R07 + H-S34 baseline removal until H-R03 is 10/10 on the combined build.
- **Diagnostic dispatched** (Lane 2, read-only): find the ungated path that clobbers panel-B's second ctrl+click selection; confirm whether it's the P5 peer-deselect debounce (`schedulePeerDeselectPanel`/`cancelScheduledPeerDeselect`), P4, or manager; verify switch-OFF full-revert coverage (I13); name the owning lane + fix.

### Decision requested (only if it escalates)
None blocking. Flagging for the Director because (a) a ratified-trust matrix row regressed, (b) the one-knob-revert discipline was breached (ungated path + mixed-phase commit), and (c) the unfreeze slips one fix+re-gate cycle. If the diagnostic shows the fix needs to re-open a phase's scope or an architecture change, I'll escalate a ruling; otherwise Manager drives it to green and re-runs the assembly gate.

### ADDENDUM (2026-07-16, after Lane 2 read-only diagnostic) — root cause refined; NOT a re-migration breach
The diagnostic (`T3-hr03-regression-diagnostic-report.md`) **disproves the peer-isolation/I13-cause hypothesis** and lands on a cleaner, more reassuring root cause:
- **Root cause = pre-existing iframe ctrl-select double-actuation race** in `drawing-tools-manager.js`: on panel B, ctrl+click fires `selectDrawing(d2, addToSelection=true)` **twice** on one physical click — once from canvas-capture `mousedown` (~2413–2439), once from the shape `click` handler (~7638–7641). The iframe-only 80ms `_suppressNextIframeCtrlSelectToggle` dedupe window misses, so the second call hits the **toggle-off** branch (~9931) and removes drawing #2 → `first=true second=false`. Host is not an iframe embed → 10/10 PASS.
- **Peer-deselect (P5) ruled OUT as the wiper** — `schedulePeerDeselectPanel` correctly early-returns when the switch is off; switch-OFF runs still fail, proving it's not the cause. **This is NOT an ungated re-migration path.** The combined-build exposure is a latent engine race (likely surfaced by the more-faithful `focusReactPanelSoft` actuation timing), not a P4/P5 defect.
- **Minor I13 hygiene debt found (not the cause):** `MultichartGrid.jsx:4055–4058` `useEffect([focusedPanelId])` calls `clearDrawingUiOnOtherPanels` without the P5 master check (settings-close leg ungated). Being closed as a small Lane 2 hygiene pass; does not affect H-R03.
- **Owning fix = Lane 1** (iframe ctrl-select dedupe in `drawing-tools-manager.js`, behind its own kill-switch), RED = H-R03 panel-B 10/10 FAIL, then re-run assembly gate on a fresh build id. No ruling needed — Manager driving to green.

---

## ESC-019 — ACKNOWLEDGED (D-022; no blocking ruling)

**Director response:** D-022 (2026-07-16). Manager's handling endorsed in full (stop-on-bless, held promotions, diagnostic-first); pre-authorization stands — Manager drives to green unless scope/architecture changes. Three binding directives: (1) **the I13 gap is part of the fix's exit criteria** — not accepted until H-R03 is 10/10 on the combined build AND every touched path is behind a switch whose OFF state provably reverts (A/B recorded); if the ungated path is pre-existing, report honestly (registry row, but new code riding it still gets gated). (2) **Mechanical mixed-commit corrective:** before committing on shared surfaces (`MultichartGrid.jsx`, `panel-cmd-bridge.js`, `drawing-tools-manager.js`), workers diff against the phase's declared file manifest and stage by hunk; any out-of-manifest hunk = STOP; Manager embeds the manifest check in every shared-surface land-prompt. Do not rewrite `f46e6d9d` history — record it as a known mixed commit, rely on mandated switch coverage for independent revert. (3) **Standing promotion order:** baseline promotions never precede an assembly-gate-green combined build. Watch item: post-fix, H-R04/H-R05 must show 10/10 before being called flakes; otherwise each gets its own row (I15).

---

## ESC-018 — Re-migration matrix materially changed (11 → 2 honest engine REDs): re-scope Phases 2–6 before Phase 2 starts

**Date:** 2026-07-16
**Track:** T3 / RC-1 + RC-4 (re-migration)
**Status:** OPEN — awaiting Director ruling. Filed per the D-018 standing condition ("if rows are genuinely green on fallback, affected phases shrink; we don't re-fix working rows") + the Manager WATCH item on matrix revalidation.

### What happened
D-018 authorized the 6-phase re-migration against **11 honest RED rows** frozen on build `20260715b2`. Lane 4's hit-coord harness fix + isolated fresh-boot revalidation (`T3-remig-harness-hitcoord-fix-plus-revalidate`) found that **8 of those 11 rows were click-miss ARTIFACTS**, not engine bugs: on panned charts the harness computed off-viewport hit coords, ctrl+click was swallowed, and clicks on resize-handle circles replaced selection instead of multi-selecting. With honest actuation, those 8 rows are **genuinely green on fallback-B**. Authoritative honest-RED count is now **2**.

| Outcome | Rows |
|---------|------|
| **Flipped GENUINELY-GREEN** (were click-miss artifacts) | H-R01, H-R02, H-R03, H-R04, H-R05, H-R08, H-R13, H-R14 |
| **HONEST engine RED** | **H-R06 (Delete does not remove from store)**, **H-R07 (cross-panel select store empty)** |

### Honesty attestation (why the 8 greens are trusted, not new false-greens)
The hit-coord fix made actuation **more** faithful (chart-layout geometry instead of stale SVG bbox; requires topmost line/path, rejects canvas/circles; iframe-aware `elementFromPoint` inside panel B; blockers dismissed). Proof the rebuilt harness can still detect real bugs — **Phase 1 A/B**: with Phase 1 ON, H-R02/H-R03 are 10/10 PASS; with `--phase1-off`, **H-R03 is 10/10 FAIL-REAL-BUG** on the panel-B ctrl leg. So the harness is not blanket-green — it flips red exactly where the engine substrate is absent. This satisfies I15.

### Impact on scope (updated row→phase map)
- **P1** (H-R02/H-R03 store legs): **DONE and proven required** (H-R03 fails without it). Commit manifest is ready (Lane 1, 7 file-scoped paths + build `20260716b1`).
- **P2** (H-R01 V9 bar): target row **already genuinely green** on fallback → starting P2 risks re-fixing a working row.
- **P3** (H-R04, H-R13): both **green post-hitcoord** → shrunk to ~no-op.
- **P4** (H-R05, H-R06): H-R05 green; **only H-R06 (Delete) remains** → P4 shrinks to the Delete keyboard leg.
- **P5** (H-R07 + H-S35/H-S44): **H-R07 remains RED** → still needed.
- **P6** (H-R08, H-R14): both **green post-hitcoord** → shrunk to ~no-op.

Net: the genuine remaining engine work is **P1 (done) + P4-Delete (H-R06) + P5 (H-R07)**. P2/P3/P6 collapse to verification-only.

### Decisions requested
1. **Trust the revalidated 2-row matrix** as the authoritative honest baseline (accept the Phase-1 A/B as sufficient honesty proof that the 8 flips are genuine).
2. **Re-scope Phases 2–6:** authorize converting **P2, P3, P6 to verify-only** (assert the green rows still hold on the combined build; **no new engine fix** — honoring "don't re-fix working rows"), and reducing **P4 to the H-R06 Delete leg** and **P5 to H-R07** as the only remaining engine phases.
3. **Phase 1 commit:** confirm Lane 1 fires the ready Phase-1 commit now (independently proven, kill-switched) rather than waiting on this ruling.
4. **Unfreeze proximity:** with only H-R06 + H-R07 left, confirm the combined-build unfreeze gate now reduces to (P1 + P4-Delete + P5 green on honest harness) + the accumulated staging work + PO parity-checklist.

### Manager recommendation
Grant all four. Fire the Phase-1 commit now (it discharges a proven honest-RED and is reversible). **Hold Phase 2 start** until this re-scope is ruled, because P2's target row is already green and D-018 forbids re-fixing working rows. Redirect Lane 1/Lane 2 to **H-R06 (Delete)** and **H-R07 (cross-panel select)** as the two real remaining engine fixes, with P2/P3/P6 as verify-only rows on the combined build.

---

## ESC-018 — RESOLVED

**Director ruling:** D-021 (2026-07-16)  
**Outcome:** All four granted. (1) **2-row matrix trusted** — the Phase-1 A/B (H-R03 10/10 FAIL-REAL-BUG with `--phase1-off`) is accepted as the I15 discriminator; the 8 flips are click-miss artifacts. Conditions: Lane 4 freezes the hit-coord-fixed harness as reference (SHA logged) and **any future actuation change re-runs the Phase-1 A/B before its results are trusted**; the 8 corresponding HR-PARITY registry rows **close as measurement-artifact, not as fixed** (fix-rate statistics stay honest). (2) **Re-scope approved:** P2/P3/P6 verify-only (10/10 on combined build, no new engine fixes/switches; a verify-only failure re-escalates to fix-scope with evidence); **P4 = H-R06 Delete leg only** (new `PANEL_KEYBOARD_V1` switch per D-018, shorter T8 collision window; Esc = verify row); **P5 stands** (H-R07 + H-S34/35/44). H-R06/H-R07 may run in parallel on disjoint file sets; one-phase-per-PR on `MultichartGrid.jsx` still binds. (3) **Phase-1 commit fires now.** (4) **Unfreeze gate re-derived** (6 criteria restated in D-021 — verify-only rows are still gate rows; full 12-row matrix must pass on the combined build; PO parity-checklist on that exact build remains the final gate). Net: two engine rows (Delete-in-panel, cross-panel selection) stand between here and the freeze lift — Manager sequences them top-of-lane and assembles the combined-build manifest in parallel.

---

## ESC-017 — A6 order-interaction contract: checkpoint approval (apply-on-release invariant + A6-4 host-canonical architecture)

**Date:** 2026-07-16
**Track:** T4 / RC-5 (Director intake amendment A6)
**Status:** OPEN — awaiting Director ruling. Not on the re-migration critical path; fixes gated on this ruling + lane slots.

**Context:** Lane 3 delivered `T4-A6-ORDER-INTERACTION-CONTRACT.md` (4 rows, contract-before-fix per intake discipline). Three items need a Director checkpoint before any A6 fix dispatches:

1. **A6-1 — approve apply-on-release as the canonical SL/TP interaction invariant.** Today open-SL drag mutates `position.stopLoss` on every `mousemove` and `updatePositions()` evaluates hits against the live (provisional) price every replay tick → trade closes while the line is merely held across price (TAL-01602). Proposed: SL/TP provisional while pointer down; commit to store only on release; replay skips hit-tests for legs under drag. Freeze-safe (`order-manager.js` only), kill-switch `__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX`.
2. **A6-4 — approve the host-canonical order-store architecture** (ARCHITECTURE DECISION). Multichart currently holds **per-panel mutable order clones** with only `order:pending-updated` sync — there is **no `order:opened-updated` fan-out**, so an open SL/TP drag on panel B never mirrors to the host or peers (TAL-01601). Proposed target: one host-canonical `orderManager`; panels render projections; any edit routes to host then fans out. Touches `MultichartGrid.jsx` + `panel-cmd-bridge.js` → overlaps the multichart re-migration surface; live RED needs the re-migration multichart lane, so **A6-4 lands after the re-migration**.
3. **Sequencing:** A6-1 first (freeze-safe), A6-2 (persistence — D-019 already settled the spec) parallel/next; **A6-3 (price-axis order isolation) + A6-4 gated to post-combined-build unfreeze**. Also asks whether A6-1 should land coherently with the held **TAL-00752 #4/#5** replay×drag/keyboard-pan pair (same `order-manager.js` region).

**Manager recommendation:** approve A6-1 invariant + sequencing now (unblocks freeze-safe Lane-3 work); ratify A6-4 host-canonical target in principle but keep its dispatch gated behind the re-migration multichart lane. Lane 3 is meanwhile on a read-only order-manager landing-sequence consolidation so it can execute immediately on approval.

---

## ESC-017 — RESOLVED

**Director ruling:** D-020 (2026-07-16)  
**Outcome:** All three approved. (1) **A6-1 apply-on-release = canonical invariant**: provisional while pointer down (renders at cursor, store unchanged, no hit-tests against it), single commit on release; replay hit-tests use the last committed value. Two mandatory state-matrix cells: committed-value crossing during drag **still closes** (protects the provisional line, doesn't suspend risk semantics — default unless PO re-specs), and drag-cancel (Esc/pointer-loss/replay-stop) discards to committed. Freeze-safe, `__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX`, RED = TAL-01602 exact repro, PO staging confirm. (2) **A6-4 host-canonical store ratified as target architecture; dispatch post-re-migration** (slots alongside Phase 7, Manager schedules to avoid `panel-cmd-bridge.js` collision). Binding design note: do NOT patch an `order:opened-updated` event onto the clone model — the fix is the ownership inversion. (3) **Sequence approved**: A6-1 now → A6-2 (D-019 spec) parallel/next → A6-3 + A6-4 post-unfreeze; A6-3 is order-side isolation only (D-019 cancelled the axis-side Defect D; RED asserts order-line invariance). (4) **#4/#5 land coherently with A6-1** as one Lane-3 `order-manager.js` region series, sequential gated commits, own switches. Lane 3 unblocked — execute immediately.

---

## ESC-016 — RESOLVED

**Director ruling:** D-018 (2026-07-15) — **APPROVED as written + 4 additions.** (1) **Phase 0 must reconcile the 12-vs-10 baseline first** — Lane 4 re-runs full matrix, freezes authoritative RED set before Phase 1 dispatches; if the 2 promoted rows are genuinely green on fallback, affected phases shrink (don't re-fix working rows). (2) **One-knob revert per phase mandatory** — incl. Phase 1 master slice switch; **Phase 4 gets its own NEW keyboard switch**, not an extension. (3) **T8 keeps running in parallel** — only pauses `panel-cmd-bridge` edits during the Phase-4 keyboard window. (4) **Unfreeze ships as ONE combined build** (re-migration + all accumulated staging: cadence b1, order-entry, settings/Esc/Delete, TF-label); PO parity-checklist sign-off on that exact build = final gate. PO role: nothing until phases complete, then parity checklist (host + panel B, build id in each frame).

---

## ESC-016 — Multichart interaction RE-MIGRATION off fallback-B: authorization to execute Phases 1–6

**Date:** 2026-07-15
**Track:** T3 / RC-1 + RC-4 (also folds parked RC-3 Phase 5)
**Trigger:** Honest cross-frame harness now stable (Lane 4 T0 step 16/17): `reactParity` = 13 expected / **12 honest RED** on build b1 (real mouse/keyboard, store/modal end-states). This is the prerequisite D-011/D-012 required before re-touching the code that broke on b44/b88.

### Ask
Authorize execution of the **6-phase gated re-migration** in `docs/tickets-overhaul/T3-REMIGRATION-PLAN.md` (plus the 7th post-unfreeze RC-3-parity tranche). This is **not** a wholesale one-shot fallback reversal — each phase discharges one root group, behind its own kill-switch, proven **10/10 GREEN** on the honest harness (I15) with a D-011 A/B before the next phase starts.

### Phases (one root group each)
1. **Engine selection substrate** (Lane 1) — re-enable tool-lifecycle V2 + legacy-selection-retire V2 in iframe context. Discharges H-R02/03, unblocks H-R01.
2. **Parent chrome routing** (T3 + L1 emit) — ownership V2 + routing V3. H-R01, H-R12.
3. **Settings transport + flash** (T3) — H-R04, H-R13, H-R09 settings leg.
4. **Esc/Delete keyboard bridge (I14)** (T1/T3) — H-R05, H-R06. *Serialized off T8 replay edits on `panel-cmd-bridge.js`.*
5. **Peer isolation / single owner** (T3) — H-R07 + H-S34/35/44.
6. **Iframe Ctrl+drag marquee** (T1) — H-R08, H-R14.
7. **(post-unfreeze) RC-3 Phase 5 anchoring parity** — H-S45–50 on `sync-bridge.js`, never interleaved with 1–6.

### Fence / safety (built into the plan)
- `MultichartGrid.jsx` = **one phase per PR**, single owner; `panel-cmd-bridge.js` Phase-4 window has **no** concurrent T8 replay edits; `sync-bridge.js`/anchoring only post-unfreeze.
- Per-phase kill-switch covers every file incl. React (I13); switch-OFF must restore that phase's RED.

### Unfreeze criteria (Manager will hold the freeze until ALL met)
1. `reactParity.knownFailing` empty (12/12 GREEN), `gate:react` PASS, each H-R 10/10 on built dist with build-id asserted inside panel-B iframe.
2. PO parity-checklist sign-off on the **same deployed build** (host + panel B).
3. H-S34/35/44 promoted out of rollback known-failing.
4. No open HR-PARITY#1–#8 registry rows left `user_replied`.

### Recommendation
Approve execution under this fence. It is the critical path to lifting the deploy freeze and shipping the accumulated staging work (cadence b1, order-entry a5, settings/Esc/Delete b105, TF-label a5) that currently cannot deploy while multichart interaction is unverified.

---

## ESC-016 — RESOLVED

**Director ruling:** D-018 (2026-07-15)  
**Outcome:** **AUTHORIZED — Phases 1–6 under the plan's fence.** Rulings: (1) phased execution as written; no phase starts until the prior phase's switch-OFF RED restoration is proven. (2) **Phase 0 hard gate incl. baseline reconcile** — Lane 4 re-runs the full 12-row step-17 matrix and freezes the authoritative row set before Phase 1 dispatches; if H-R07/H-R12 are genuinely green on fallback-B, the row→phase map updates and Phases 2/5 shrink (no re-fixing green rows). (3) Kill-switches: Phase 4 uses the **new** `PANEL_KEYBOARD_V1` switch (do not extend quickbar-settings); the Phase-1 master slice switch is **required, not optional** — every multi-predicate phase needs a one-knob revert. (4) T8 collision: Manager owns the Phase-4 window; T8 pauses `panel-cmd-bridge.js` edits for that window only, otherwise continues in parallel (D-013/D-016 unaffected); `sync-bridge.js` untouched until post-unfreeze. (5) **Unfreeze criteria ratified** + one addition: the unfreeze deploy is a **single combined build** carrying the accumulated staging work; PO parity sign-off happens on that combined build, with smoke rows for previously staging-confirmed items. (6) Labeling: DONE (dev only) — NEEDS-LIVE until the PO checklist pass; GREEN-SYNTHETIC has no role in reactParity. (7) Phase 7 approved in principle; dispatch gated on a post-unfreeze Director go-signal.

---

## ESC-015 — RESOLVED

**Director ruling:** D-017 (2026-07-15)  
**Outcome:** (1) Policy **approved with a precision**: when `userHasPanned`, no post-release index-pin or prepend compensation may move the panel toward grab/host anchors — but prepend compensation is **re-based to the released (post-drag) viewport, not removed** (deleting it would trade snap-back for prepend-jump). (2) **Scope: host + all panels**; state matrix must cover paused/playing (incl. BL-12 drag-disengage non-conflict), sync on/off, and prove no D-015 edge-park interaction. (3) **Standalone gated fix confirmed** — switch `__TALARIA_MC_DISABLE_PAN_RELEASE_ANCHOR_HOLD`, RED-first via **H-S82** (Lane 4 confirms id), acceptance = H-S82 RED→GREEN + switch A/B + H-S73/BL-12/D-015 families green + PO staging confirm; not folded into T5 or policy-v2. (4) **H-S73 FAIL-REAL-BUG registered as a separate defect** (B-FIX-C prepend compensation, host-backward-load peer shift); diagnostic queues behind the TAL-01579 fix; mapping correction accepted.

---

## ESC-015 — RESOLVED

**Director ruling:** D-017 (2026-07-15) — **APPROVED.** Policy: once the user has panned, the **released viewport wins** — nothing may yank the chart toward the grab point or a host anchor. Technical precision: prepend compensation is **NOT deleted — it's re-based to the post-drag viewport** (keeps bars steady when left-history loads; only the stale pre-drag baseline is dropped). Applies to **host and panels**. **Standalone gated fix**, PO staging confirm. The manager side-discovery (**H-S73** genuinely-failing prepend-compensation scenario) is registered as **its own defect**, not folded in.

---

## ESC-015 — TAL-01579 drag-release snap-back: fix policy needs sign-off (escalation-class per D-014)

**Date:** 2026-07-15
**Track:** T8 (Lane 2)
**RC:** RC-8 / RC-3 (anchor)
**Trigger:** Step-11 diagnostic complete; D-014 ruling 3 pre-designated this cell escalation-class (do not fold into migration).

### Mechanism (step-11 diagnostic)
On pan release near/during replay (`chart.js:32387+`): `onUserPan()` sets `userHasPanned` (`replay-system.js:5748`) → `_scheduleReplayPanLoadLeft()` async prepend (`chart.js:25750+`). The snap-back to the grab point comes from one/both of:
- **(a) Index-pin** — boot/host mirror pins `offsetX` to a stale right-edge bar index (`chart.js:3454-3459`, `17187-17344`).
- **(b) Prepend compensation** — `_applyMultichartMirrorPrependCompensation` / `_tryExtendReplayMasterFromParent` shifts offset from a pre-drag snapshot, undoing the drag delta (`chart.js:2490-2527`, `5862-5880`).
`drag.startOffsetX` is stored but never restored on release; "grab point" = the viewport at mousedown.

### Proposed policy (needs sign-off)
**When `userHasPanned`, no post-release index-pin or prepend compensation may recenter the panel toward grab/host anchors** — the user's released viewport wins until they re-engage sync. Gated fix, RED-first.

### Decision requested
1. Approve the policy above (user-pan viewport is authoritative post-release).
2. Confirm scope: does this apply to host + all panels, or panels only? Any interaction with the D-015 edge-park advance (should not conflict — different path).
3. Kill-switch name + whether it's a standalone fix (recommended) vs folded into a future anchor-unification (T5/RC-3) pass.

### Notes for the ledger (not part of the ask)
- **H-S73 mis-mapped:** it pins **B-FIX-C prepend compensation** (host backward-load shifts peer `offsetX`), NOT TAL-01579 — and H-S73 currently **FAIL-REAL-BUG** (a separate prepend-compensation defect to track, `H-S73`). Coverage/policy-table mapping corrected.
- **New RED for TAL-01579 = `H-S82`** (NOT "H-S79" — that id is already the refresh-persistence scenario). Spec: paused replay → real pan on panel B → assert settled `offsetX` ≈ release offsetX, not grab-time offsetX (after 2.5s pan-load settle). Lane 4 to assign/confirm the id.

### Manager recommendation
Approve (1); standalone gated fix (`__TALARIA_MC_PAN_RELEASE_ANCHOR_HOLD` or similar), RED-first via H-S82, staging PO confirm. Keep separate from the mirror-policy-v2 migration.

---

## ESC-014 — RESOLVED

**Director ruling:** D-016 (2026-07-15)
**Outcome:** APPROVED the **unified finest-TF shared clock** (PO spec); **overruled the Manager's decoupled recommendation** — decoupled can't deliver progressive coarse-candle forming, and the perf fear conflated clock ticks with renders (Plan-1 rule: renders track pixel-column crossings, so sub-pixel 1m ticks on a 4h panel coalesce to ~zero repaints; coarse forming-candle updates MUST route through that coalesce path — mandatory design requirement). Fixed decisions: (1) **speed unchanged** — anchored to the selected panel (host 4h @ 1 candle/sec still forms one 4h candle/sec; the 1m panel plays 240 smoothly inside it); **all panels always show the same market timestamp (parity invariant)**. (2) **Every panel counts toward finest TF, including different-symbol**; clock **re-derives live** on add/close/re-TF **without jolting any viewport**. Process: **design doc first with a measured cost column** (frame times, 4-panel 1m/4h at max speed, before/after) — if it breaks the frame budget it returns with data, no silent degrade; own kill-switch; staging-only. Acceptance: **PO staging A/B** (flip new vs today in one session). → dispatched `T8-step12-lane2-finest-tf-cadence-design.md`.

---

## ESC-014 — Replay cadence master: PO wants finest-TF, not selected-panel (the parked D-015 secondary, now reopened)

**Date:** 2026-07-15
**Track:** T8 (Lane 2)
**RC:** RC-8
**Trigger:** Freeze fix (TAL-01590) PO-CONFIRMED on a4 — none stuck. With the freeze gone, the cadence complaint remains, exactly the reopen D-015 anticipated.

### PO spec
In a multi-panel mixed-TF layout, on Play **all panels advance at the selected/Panel-A panel's TF** (e.g. host 4h → every panel, including 1m ones, steps 4h at a time). PO wants the replay clock to tick at the **smallest (finest) TF present across all panels**, regardless of which panel is selected — so a 1m panel advances 1m-by-1m and coarser panels form their candle over the finer ticks.

### Why this is a Director design call (not a silent fix)
- It **changes shipped behavior**: today the cadence master is the host/selected panel's TF. Proposed: the master = `min(TF)` across all present panels. Per D-013/D-015 zero-behavior-change, a cadence-policy change escalates.
- **Performance implication (the real design question):** if the host is 4h and a panel is 1m, ticking the replay clock at 1m means ~240 sub-steps per host candle — the host and all coarser panels must advance/render at the finer cadence. Need a ruling on whether the whole replay clock runs at finest granularity, or only the finer panels sub-advance while the host keeps its own step (decoupled cadence).
- Mechanism is already mapped (step-4 diagnostic: replay-master = host/selected panel; coarse/finer panels derive from it).

### Open forks for the Director
1. **Clock granularity:** whole replay clock at finest TF (simplest, heaviest) vs decoupled (host steps at its TF; finer panels interpolate/sub-advance).
2. **Master re-derivation:** if the finest-TF panel is closed/added mid-replay, does the master re-compute live?
3. **Independent-symbol panels:** does `min(TF)` include panels on different symbols, or only same-symbol?
4. **Interaction with the edge-park fix (D-015):** own-master advance stays; this only changes the shared-clock cadence the panels key off.

### Manager recommendation
Authorize a **design doc first** (Lane 2), then implement behind a new switch (e.g. `__TALARIA_MC_FINEST_TF_REPLAY_CADENCE`), RED-first, staging PO confirm. Recommend the **decoupled** option (finer panels sub-advance; host keeps its cadence) to avoid a 240×-render blowup — but defer to the Director. Freeze-exempt; staging-only.

---

## ESC-014 — RESOLVED

**Director ruling:** D-016 (2026-07-15)  
**Outcome:** Design-doc-first approved, but **decoupled recommendation OVERRULED — unified finest-TF clock per the PO's spec.** Decoupled cannot deliver "coarser candles form over the finer ticks," and the 240× concern conflates ticks with renders: coarse-panel forming-candle updates MUST route through the BL-13 pixel-column coalesce path (hard design requirement), so sub-pixel ticks coalesce to near-zero renders. **Speed semantics ruled:** the speed control keeps today's perceived pace anchored to the selected panel's TF; finer ticks subdivide within it (host 4h at 1 candle/sec still forms one 4h candle/sec; the 1m panel covers its 240 candles inside that second). Wall-clock market-timestamp parity across panels is the invariant. **Re-derivation:** live, edge-triggered on panel add/close/TF-switch, no per-frame polling, no seek/viewport shift on recompute. **Independent symbols: included** in `min(TF)`. **Edge-park (D-015) untouched** — clock carries no data; new missing-data edges are handled by the D-015 fallback. Switch: `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` (off = today's cadence exactly); staging default fix ON, PO A/Bs both postures. Design doc must include a **measured cost column** (4-panel 1m/4h mix, max speed, before/after); if the frame budget breaks, escalate with numbers — no silent degrade to decoupled. Acceptance: honest harness evidence (I15) + **PO staging A/B is the deciding authority**. D-014's TAL-01563 documented-intentional ruling is superseded once this is accepted.

---

## ESC-013 — RESOLVED

**Director ruling:** D-015 (2026-07-15)
**Outcome:** All four requests GRANTED. (1) Extension authorized as ONE root fix — all playing panels (same-TF, coarser, finer self-owner, independent) share one rule: advance on own loaded data during play, async catch-up = fallback for genuinely-missing data only. (2) Unified switch `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE` approved; step-3's switch folded in, no double-gate window. (3) Finest-TF-master confirmed SECONDARY (cadence feel, not the freeze) — parked, evaluated after this fix lands. (4) Coarse-panel full re-render → RC-2/T2 render-invalidation track (with TAL-01573). **Hard constraint:** must NOT reintroduce the Plan-1 coarse-panel reslice storm — that scenario family stays GREEN as the regression fence. Acceptance = **PO staging confirm** (harness can't force the breaker). Policy table amended to match. → dispatched `T8-step5-lane2-unified-play-edge-park-advance-FIX.md`.

---

## ESC-013 — TAL-01590 freeze is broader than ruled: same-symbol mixed-TF play cells hit the same edge-park; extend the own-master advance

**Date:** 2026-07-15
**Track:** T8 (Lane 2), per D-013/D-014
**RC:** RC-8
**Urgency:** P1 — the freeze the PO reported is only partially cured by `20260715a1`; it still hits same-symbol mixed-TF layouts intermittently.

### Finding (Lane 2 step-4 diagnostic + PO repro)
The PO repro — "one panel stops while others play; **stays stuck until the TF is changed, then resumes**" — is the **same TAL-01590 edge-park / catch-up-breaker mechanism**, NOT a new bug class. `setTimeframe` refetches a window anchored on the host playhead (`panel-cmd-bridge.js:2387–2394`, `chart.js:6268+`) so the panel master finally covers the host `replayTimestamp` and the catch-up state clears (`_mcCatchUpFails`, `_mcCatchUpCooldownUntil`, `:1161–1162`). The step-3 fix does not reach it because it is gated to `!isSameSymbolAsHost` only (`panel-cmd-bridge.js:815–819`).

Stuck-panel mechanisms in a mixed-TF layout:
- **Same TF as host** — mirror fail → `scheduleMirrorCatchUp` → 3-strike breaker (`:1147–1154`) → 2.5s park at furthest-loaded edge (identical to TAL-01590).
- **Coarser (e.g. 4h)** — BL-10 `scheduleCoalescedSeek` tries parent mirror first; fetch lag leaves the panel parked at loaded edge until a TF refetch.
- **Finer self-owner (e.g. 1m vs host 4h)** — `forceReplaySeek` + `_ensureFinerPanelOwnerCoversPlayhead` fetch race.

These cells were **ratified "current = correct" under D-014 ruling 1** — the PO evidence shows they are not; hence this escalation rather than a silent migration.

### Decision requested
1. **Authorize extending the step-3 own-master play-advance to the same-symbol PLAY cells** (same-TF×playing, coarser×playing — `scheduleCoalescedSeek(ch, ts, true)` during PLAY, skipping the mirror-first fetch that causes the park; finer self-owner covered by the same own-master principle). One root fix across the play cells, not per-cell patches.
2. **Kill-switch granularity:** recommend a unified switch for the edge-park advance (e.g. broaden `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` → `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE`, covering independent + same-symbol) since it is one mechanism — or confirm you want it split.
3. **Confirm the PO's finest-TF-master idea is SECONDARY** — the diagnostic says it addresses jump/group-advance *feel*, not the edge-park freeze. Defer it as a separate cadence policy cell after the freeze extension lands.
4. **Confirm the coarse-panel full re-render + viewport-move-back is an RC-2/T2 cross-cut** (render-invalidation), routed out of T8 per the earlier TAL-01573 routing.

### Manager recommendation
Approve (1) with the unified switch (2). Acceptance stays PO-staging-confirm-led (the local harness can't force the breaker — proven by the H-S59b WEAK verdict), with the step-6/7 PO note in the diagnostic report (record the stuck panel's TF vs host TF when the freeze hits) as the disambiguating evidence. Extend H-S59b to a same-TF/coarser variant as dev evidence, labeled GREEN-SYNTHETIC. Freeze stays; ships to staging only.

---

## ESC-013 — RESOLVED

**Director ruling:** D-015 (2026-07-15)  
**Outcome:** All four granted. (1) **Extension authorized as one root fix across the PLAY cells** (same-TF, coarser, finer self-owner): own-master advance during PLAY, mirror-first fetch skipped, catch-up/breaker demoted to fallback-only; BL-5 storm + BL-10/11/12/13 + H-S17/H-S19 stay green as the regression fence. **D-014 ruling 1 formally amended** — the same-symbol play cells move from ratified to approved-changed; policy table updated so the migration implements the corrected cells. (2) **Unified switch approved:** `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE`; the step-3 `INDEPENDENT_PAIR_PLAY_ADVANCE` switch is superseded/folded in (no dual-gating window; H-S59b A/B re-run on the unified switch). (3) **Finest-TF-master confirmed secondary** — cadence-feel proposal parked until after the freeze extension + PO retest (the park may be the felt chunkiness). (4) **Coarse-panel re-render confirmed RC-2/T2 cross-cut**, routed out of T8. Acceptance = PO staging confirm-led; same-TF/coarser harness variant lands as labeled GREEN-SYNTHETIC dev evidence; PO records stuck-panel TF vs host TF on retest; deploy freeze unaffected.

---

## ESC-012 — RESOLVED

**Director ruling:** D-014 (2026-07-15)
**Outcome:** Policy table APPROVED as the T8 acceptance spec (3 flagged cells carved out from silent migration). Independent×playing fix AUTHORIZED as the T8 priority (TAL-01590 P1): advance on the panel's own master during play (BL-10 analog), async catch-up demoted to fallback, gated `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE`, may land ahead of the policy-v2 migration. RED-first via **H-S59b** (current H-S59 rejected as non-reproducing). Other cells: BL-16/TAL-01578 diagnostic-first; TAL-01579 pinned by H-S73 then own diagnostic; TAL-01573 re-routed to RC-2/T2; TAL-01563 ruled documented-intentional (retest after freeze fix). Harness: Lane 2 extends `serve.mjs`+host scenarios (distinct symbols + production-faithful play), Lane 4 gives one written actuation sign-off. Acceptance = H-S59b RED→GREEN + kill-switch A/B + BL-10/11/12/13 stay green + Lane 4 sign-off + PO staging live-confirm.

---

## ESC-012 — T8 mirror-policy table ready for approval; independent×playing cell (TAL-01590 P1 freeze) diverges from shipped behavior

**Date:** 2026-07-15
**Track:** T8 (Lane 2), per D-013
**RC:** RC-8
**Urgency:** Gates the T8 migration (D-013 ruling 1 step 3 requires Director approval of the table before impl). TAL-01590 is a live P1.

### Context
Lane 2 delivered `T8-MIRROR-POLICY-TABLE.md` — the full adopt-data / adopt-X / adopt-Y matrix (TF relation × replay × sync), each cell extracted from the shipped guard that dictates it (file:line cited). This is the design doc D-013 ruling 1 step 2 asked for, with the A5/TAL-01590 trace as its first input. Coverage-hardening scenarios (H-S60–H-S78, step 1) are being written in parallel and encode current behavior only.

### TAL-01590 root cause (the P1 freeze)
**Policy gap, not a guard bug.** There is **no independent-symbol equivalent of BL-10 play-advance** (`scheduleCoalescedSeek` during `isPlaying`, which only runs when `isSameSymbolAsHost`). Independent-symbol panels advance via mirror-frame timestamps + async `ensureReplayDataCoversTimestamp`; when the fetch lags or the 3-strike catch-up breaker trips (`panel-cmd-bridge.js:1135–1143`), the panel **freezes at its loaded edge for 2.5s+** while the host plays on. This is the `{independent × playing}` cell, and its **correct** policy (advance on the panel's own master, mirroring BL-10) **differs from shipped behavior** — so per D-013 ruling 3 it is an escalation, not a silent correction.

### Decisions requested
1. **Approve the policy table** as the T8 acceptance spec (or flag cells to revisit), unblocking step 3 migration behind `__TALARIA_DISABLE_MIRROR_POLICY_V2`.
2. **Authorize the independent×playing cell change** (TAL-01590 fix): add an independent-symbol play-advance path analogous to BL-10, gated by a new switch (proposed `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE`). This is the one cell where correct ≠ shipped and it's the live P1.
3. **Rule on the other escalation-candidate cells:** playing×drag×adopt-X (BL-16, TAL-01578 — diagnostic-first?), release snap-back adopt-X (TAL-01579 — prepend-compensation policy?), and the two cross-cuts that are **not** mirror-policy (TAL-01573 manual-rescale re-render → RC-2; TAL-01563 group-advance cadence → documented-intentional, PO may want smoother).
4. **Harness fidelity flag (I15/D-012 family):** the current H-S59 passes on the contract path (`hostReplaySeek`+`replayFrame`) but does **not** reproduce the real B-freeze — `serve.mjs` only serves one symbol and the inner loop uses synthetic seek, not tick-animation. A faithful RED (`H-S59b`) needs ≥2 distinct-symbol panels + production-faithful play actuation. This overlaps Lane 4's honest-harness rebuild — request a ruling on who owns the distinct-symbol replay actuation surface.

### Manager recommendation
Approve (1) and (2) — TAL-01590's fix is well-scoped and gated. For (4), have Lane 2 extend `serve.mjs`/host scenarios for the distinct-symbol replay RED (host harness, not `react-parity-lib.mjs`), coordinating the actuation approach with Lane 4 to avoid a second false-green. Migration stays staging-only while the D-012 deploy freeze holds.

---

## ESC-012 — RESOLVED

**Director ruling:** D-014 (2026-07-15)  
**Outcome:** (1) Policy table **approved** as the T8 acceptance spec, with the three §4 flagged cells carved out of silent migration; all ratified cells unblock guard-by-guard migration behind `__TALARIA_DISABLE_MIRROR_POLICY_V2`. (2) **Independent×playing cell change authorized — T8 priority item**: advance on the panel's own master during play (BL-10-style), catch-up/breaker demoted to fallback; gated `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE`; **RED-first via H-S59b only** (current H-S59 disallowed as acceptance); may land ahead of the migration; acceptance = H-S59b RED→GREEN + switch A/B + BL-10/11/12/13 green + PO live-confirm on staging. (3) BL-16 diagnostic-first confirmed (H-S78 pins); TAL-01579 escalation-class, H-S73 pins first, separate diagnostic later; TAL-01573 re-routed to RC-2/T2; TAL-01563 documented-intentional — retest after the independent-play fix (its freeze-stutter may be the real complaint). (4) Lane 2 owns the distinct-symbol replay actuation surface (`serve.mjs` + host scenarios — not `react-parity-lib.mjs`); Lane 4 gives a written actuation sign-off in MANAGER-FINDINGS before H-S59b is trusted; I15 end-state assertions mandatory. (5) Lane 2 order: H-S59b RED → independent-play fix → staging → PO confirm; H-S60–78 promotion parallel; migration of ratified cells; then TAL-01579 diagnostic.

---

## ESC-006 — RESOLVED

**Director ruling:** D-006 (2026-07-13)
**Outcome:** Premise corrected — the kill-switch isolation test was inconclusive because T1 steps 4/5 edited `MultichartGrid.jsx` (`:4756`, `:5822-5837`) **outside** the engine kill-switch (an I3 breach), so "switch off, no change" cannot distinguish "React owns selection" from "our own un-gated React edits regressed it." Rulings: (1) no harness-only acceptance — approved; (2) recovery path (a) **reordered** — step-7's first deliverable is a **gating audit + A/B revert of the un-gated React edits** in the real product, before any ownership hunt; (3) fallback (b) **pre-authorized** — if the step-4/5 model is wrong for panels, revert + default multichart migration OFF (single-chart stays ON), ship a stable build, re-migrate under the parity gate; option (c) rejected (Lane 1 owns recovery); (4) production-React parity checklist = standing per-build gate (manual now, Lane 4 automates later); (5) **new INVARIANTS I13** — a kill-switch must cover every file a fix touches, React included; ungatable edits are an automatic acceptance blocker. Step-7 prompt restructured to lead with the audit.

---

## ESC-006 (original) — T1 multichart selection: harness-green fixes keep breaking the live React product; approach decision needed

**Date:** 2026-07-13
**Track:** T1 (Lane 1), build `20260712b8`
**RC:** RC-1
**Urgency:** Blocks T1 closure; PO's live multichart selection is degraded vs. pre-overhaul.

### Context
T1 steps 4 and 5 each passed the harness gate (H-S32–37/43/44 green) and were accepted, but each broke the **live React multichart** in a way the harness never caught. On `b8` the PO reports three concurrent regressions in multichart panels (single chart is fine):
- **R1** — Ctrl-select no longer works correctly.
- **R2** — no blue selection/preview border shown during selection.
- **R3** — settings menu **flashes open then immediately closes** in a panel (open/close race in one interaction).

### The mechanism-level finding (why this is an escalation, not a patch)
Isolation test: PO set `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2 = true` and reloaded. **No change** — all three regressions persist with the T1 engine lifecycle disabled. That means the live multichart selection path does **not** run through the gated engine lifecycle the workers have been editing; the production React surface (`MultichartGrid.jsx` / chart-embed) is the real owner, and it is neither gated by our kill-switch nor exercised by the harness (`multichart-manager.js`). We have been validating fixes on a surface that isn't the one the PO uses.

### Decision requested
1. **Pause forward patching of T1 on harness evidence.** Require every T1 multichart fix to carry a **real-product (React `MultichartGrid`) reproduction + verification**, not harness-only, before acceptance.
2. Choose the recovery path:
   - **(a)** Keep the kill-switch defaulted ON and dispatch the consolidated Lane-1 diagnostic (`T1-step6-...`) to find where the React surface owns selection and fix R1/R2/R3 there; **or**
   - **(b)** Default the T1 multichart migration **OFF** (ship known pre-overhaul behavior for panels) until a production-React parity harness exists, then re-migrate once; **or**
   - **(c)** Fold this into T3 (multichart interaction parity, Lane 2) since the owner is the React multichart, not the engine.
3. Authorize a small **production-React parity check** (even a manual PO script) as a standing acceptance gate for T1/T3 multichart work, since the current harness has a proven blind spot.

### Manager recommendation
Approve **(1)** unconditionally. For recovery, **(a)** with a hard constraint: Lane 1's step-6 diagnostic must locate the React-surface owner and reproduce R1/R2/R3 there before any fix; if it can't be fixed without reworking the step-4/5 ownership model, fall back to **(b)**. Add the production-React parity check as a gate. T1 acceptance rolled back to ~70% until live-confirmed.

### UPDATE (2026-07-13) — step-6 diagnostic returned; mechanism CONFIRMED in React parent
Lane 1 completed Part 1 and stopped at the stop condition (fix requires a React ownership rework). The owner is `MultichartGrid.jsx`, not the engine:
- **R3 (settings flash):** open path `openDrawingSettingsForPanel()` (`MultichartGrid.jsx:4854-4867`) races the close path — `clearDrawingUiOnOtherPanels()` still calls `closeDrawingSettingsOnAllPanels()` **unconditionally** (`:4754-4768`), and `openDrawingSettingsForPanel()` itself calls it right after opening (`:4860-4867`). `skipV9Dismiss` only skips `multichart-dismiss-drawing-settings`, not the parent-wide close → open-then-close in one interaction.
- **R2 (no border):** per-tool selected chrome is engine-owned (`drawing-tools-base.js:2280-2296`) but the panel focus frame is React-owned (`MultichartGrid.jsx:3585-3624`, `:6508-6522`) and CSS strips all other borders (`talaria-design/live/index.html:266-301`); routing selection through parent cleanup desyncs the two owners.
- **R1 (Ctrl):** Row-2 iframe suppression is correctly scoped, but parent focus cleanup (`clearDrawingUiOnOtherPanels()`/`deselectDrawingsOnNonFocusedPanels()`, `MultichartGrid.jsx:1970-1988, 3719-3742, 6308-6322`) is a separate owner that still re-routes UI around the iframe selection.
- **Recommended fix shape (worker):** split `clearDrawingUiOnOtherPanels(sourceId, opts)` into source-preserving ops (peer-deselect / peer-settings-close / parent V9 dismiss / source-settings-close-only-on-explicit-deselect-Esc-delete); treat `multichart-close-drawing-settings` as source-scoped, not "clear all other panels."
- **Harness blind spot proven:** H-S43/H-S44 both PASS while the live surface is broken. A real-React acceptance path is mandatory before the fix is accepted.

**Refined decision requested:** authorize the step-7 fix in `MultichartGrid.jsx` (recovery path (a)) per the worker's fix shape, gated by a new React-scoped switch, with a mandatory real-product PO acceptance script (already drafted in the step-6 report). Full diagnostic: `worker-reports/T1-step6-multichart-selection-regression-report.md`.

---

## ESC-006 — RESOLVED

**Director ruling:** D-006 (2026-07-13)  
**Outcome:** Premise corrected — the kill-switch isolation test is **invalid evidence**: steps 4/5 edited production React (`MultichartGrid.jsx:4756`, `:5822-5837`) *outside* `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`, so "switch off, no change" cannot exonerate our own un-gated edits (I3 breach in substance). Request 1 approved unconditionally. Recovery = (a) but step-6 diagnostic starts with a **gating audit**: enumerate every un-gated step-4/5 edit (edit → switch coverage → revertible table), A/B-revert them against R1–R3 in the real product *first*; only then hunt independent React ownership. Fallback (b) pre-authorized if the model is wrong for panels (single-chart stays ON). Option (c) rejected — Lane 1 owns its regressions. Production-React parity checklist becomes a standing acceptance gate (Lane 4 scopes automated version after recovery). New standing rule: **a kill-switch must cover every file its fix touches** — ungated-live + harness-green is an automatic acceptance blocker.

## ESC-001 — T1 design checkpoint: approve ToolLifecycleStore before implementation

**Date:** 2026-07-12  
**Track:** T1 step 2 (Lane 1)  
**RC:** RC-1  
**Urgency:** Blocks Lane 1 implementation (the heaviest lane; 60%+ of ticket volume depends on it).

### Context
Worker 2 delivered the T1 step 1 diagnostic (`worker-reports/T1-lane1-lifecycle-diagnostic-report.md`). **RC-1 confirmed:** there is no single lifecycle owner. Selection, hover, edit, menu, settings, labels, object tree, and legacy `chart.js` paths each hold independent state. No code was edited (diagnostic only).

### Key findings (evidence-backed)
1. **First-click-fails (30 tickets):** `finalizeDrawing` / `addDrawing` can create without running the full `selectDrawing` subscriber chain unless `{ allowWhileArmed: true }`. Second click on an existing shape always calls `selectDrawing` → user sees "first click fails, second works." (`drawing-tools-manager.js:9501-9505`, `6705-6718`, `7291-7294`).
2. **Ghost-after-delete (19 tickets):** `deleteDrawing` clears canvas + manager refs but **does not** call `settingsPanel.hide()`; `DrawingSettingsPanel.currentDrawing` survives. Legacy `chart.js:18956-18964` deletes by index without manager cleanup. V9 quick bar can retain `tlBarSelected` while `toolbar.currentDrawing` is null (`drawing-tools-manager.js:10565-10566`).
3. **RC-2 adjacent:** generic `addDrawing` may not call `chart.scheduleRender()` — contributes to "stuck until click" (T2 track, not T1).
4. **RC-3 adjacent:** anchored VWAP bar-index mutation during render (`drawing-tools-advanced-volume.js:525-531`) — T5 track.

### Proposed design (worker input — NOT implemented)
**Kill-switch (implementation):** `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` (default ON).

**Store shape (per chart/panel instance):**
- `activeTool`, `placement`, `selection` (primaryId + selectedIds), `hover`, `edit`, `visibility`, `drag`

**Events (subscribers only — no cross-module direct mutation):**
- `toolSelected`, `toolDeselected`, `toolHovered`, `toolEditStarted`, `toolEdited`, `toolEditEnded`, `toolDeleted`, `toolHidden`, `toolShown`, `activeToolChanged`

**Migration order (per TRACKS.md):**
1. Quick menu / floating toolbar + V9 parent sync (highest ticket density)
2. Price/time axis labels + on-canvas label groups
3. Settings dialog + context menu (ghost-after-delete family)
4. Object tree
5. Manager selection/hover/edit flags → store
6. Retire legacy `Chart.selectedDrawing` / `Chart.drawings` index stack
7. Per-tool classes — geometry only; subscribe to store for chrome

**T0 harness:** H-S32 (first-click-fails) and H-S33 (ghost-after-delete) are RED and tracked in `known-failing.json` — they become the T1 acceptance contract when implementation lands.

### Decision requested
1. **Approve** the store + events + migration order as specced (or specify amendments).
2. **Approve** proceeding to T1 step 3 implementation behind `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`, with RED-first proof on H-S32/H-S33 + the four symptom-family suites per TRACKS exit criteria.
3. **Rule** on scope: should step 3 implement **migration steps 1–3 only** (menus/labels/settings — highest density) in the first build, with steps 4–7 in a follow-on gated task? (Manager recommends yes — smaller blast radius, faster first GREEN on H-S32/H-S33.)

### Manager recommendation
**Approve design; implement migration steps 1–3 first** (quick menu + labels + settings/context menu). That directly targets the two RED harness scenarios and the four highest-density symptom families without touching all 30+ tool classes in one build.

**Do not extend** the plan-1 mirror-frame guard tail (I11). T1 is drawing-tools lifecycle only.

---

## ESC-001 — RESOLVED

**Director ruling:** D-001 (2026-07-12)  
**Outcome:** Design approved. T1 step 3 authorized — migration steps **1–3 only** (quick menu + labels + settings/context menu). Steps 4–7 deferred to T1 step 4 follow-on task. H-S32/H-S33 are the acceptance contract. Lane 1 unblocked.

---

## ESC-002 — T3 interaction-parity contract: approve canonical ownership split + resolve 2 open questions

**Date:** 2026-07-12  
**Track:** T3 step 1 → step 2 (Lane 2)  
**RC:** RC-4  
**Urgency:** Blocks T3 step 2 (harness scenarios). Lane 2 is currently productive on this design; step 2 cannot start until the contract table is ratified.

### Context
Worker 3 delivered the T3 interaction-parity contract (`T3-INTERACTION-PARITY-CONTRACT.md`) + report. **12 interaction surfaces** mapped today→target owner/transport with file:line evidence. No code edited; legacy `multichart/` untouched (L2). I11 respected — replay mirror-frame rows (TAL-01480/01488/01489/01496/01497) are correctly excluded as DEFER-T8, not contract rows.

Manager verification: evidence spot-checked against `embed-bridge.js`, `panel-cmd-bridge.js`, `sync-bridge.js`, `MultichartGrid.jsx` — consistent. The DEFER-T8 exclusion table is disciplined (no attempt to smuggle a mirror-frame fix into T3).

### Decision requested
1. **Approve the canonical ownership split:** **panel-local** selection / draw / indicator state; **parent-owned** V9 Quick Menu, settings modal, focus routing, order-rail chrome. (This is the RC-4 analogue of Plan 1's data-ownership contract.)
2. **Confirm drawing-sync default ON** (`multichart-manager.js:101`) is intentional. T3 would then gate cross-symbol ghost-apply (TAL-01495) **without** changing the default UX. If the Director wants default OFF, that's a scope change to flag now.
3. **Two open questions the worker cannot resolve without a ruling** (both need RED-isolation in step 2 — Director to confirm approach):
   - **Row 2 (Selection/Ctrl-select, TAL-01498):** Ctrl-collapse cause — inbound coordinate decoration (`sync-bridge.js:1784-1838`) vs parent focus-cleanup racing the selection guard? Manager recommends: step 2 writes a RED that isolates which, before any fix.
   - **Row 11 (Pan bounds, TAL-01491):** host `#chartWrapper` slot geometry vs iframe cell mismatch. Manager recommends: measure host vs iframe effective plot rect in a RED harness probe before fix.

### Manager recommendation
**Approve the split and default-ON confirmation; authorize step 2 to proceed RED-first**, resolving the two open questions by reproduction rather than up-front design (they are mechanism-identification, exactly what a RED scenario is for). Step 2 scope = **retest survivors ∩ contract rows** only — so it stays gated on the PO retest results (in progress).

### Note for the ledger (not a decision)
ROOT-CAUSES RC-4 cites `order-manager.js:16626-16643` as the host order rail; that line range is **stale** (now TP-render HTML). Corrected evidence: `order-manager.js:7750-7756`, `13374-13430`; `MultichartGrid.jsx:5013-5015`, `5272-5276`, `5905-5914`. Flagging so ROOT-CAUSES can be footnoted; not blocking.

---

## ESC-002 — RESOLVED

**Director ruling:** D-002 (2026-07-12)  
**Outcome:** Contract table ratified (panel-local selection/draw/indicator/pan; parent-owned focus/quick-menu/settings/replay-transport/order-rail/context-menu). Drawing-sync default ON confirmed intentional — TAL-01495 fix gates cross-symbol ghost-apply only. Rows 2 and 11 proceed by RED-isolation/measurement probe and return to Director with results before their fixes dispatch. Step 2 scope = retest survivors ∩ contract rows. Stale RC-4 citation footnoted. Lane 2 step 2 authorized.

---

## ESC-003 — T1 first build GREEN: request T1 step 4 authorization

**Date:** 2026-07-12  
**Track:** T1 step 3 → step 4 (Lane 1)  
**RC:** RC-1  
**Urgency:** Lane 1 idles until step 4 is authorized (heaviest lane, 60%+ of ticket volume).

### First-build result (D-001 exit criteria — ALL MET)
Worker 2 delivered `worker-reports/T1-step3-lifecycle-impl-report.md`. Manager verification of the evidence:

| Exit criterion (D-001) | Result |
|---|---|
| H-S32 (first-click-fails) GREEN | PASS ×3 runs |
| H-S33 (ghost-after-delete) GREEN | PASS ×3 runs |
| Kill-switch A/B turns both RED | FAIL ×3 with `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` set |
| Full gate clean | 31 scenarios pass, 0 known-failing, 0 regressions |
| Migration steps 1–3 only (no 4–7) | Confirmed — no object-tree / manager-flags / `Chart.selectedDrawing` retirement / per-tool migration |
| RC-2 / RC-3 kept out | Confirmed |
| Both trees byte-identical | SHA256 MATCH on all 10 paired files |
| State matrix delivered | 16-cell matrix (single/multi × 4 actions × settings open/closed) |
| I11 (no mirror-frame guards) | Held |

Mechanism is correct per D-001: first-click routes through `toolSelected` on placement-complete (`drawing-tools-manager.js:6441,6829`) and armed-tool select (`:3556`); ghost-after-delete routes through `toolDeleted` driving all subscriber teardown (`:10693`) — not per-path patches.

Build id bumped to `20260712b1` (see note below).

### Decision requested
**Authorize T1 step 4** — migration steps 4–7 (object tree, manager selection/hover/edit flags → store, retire legacy `Chart.selectedDrawing`/`Chart.drawings` index stack, per-tool classes subscribe to store for chrome). This is where selection-desync (43) and stale-quick-menu (24) families fully close.

### Manager recommendation
Authorize step 4, **conditional on PO live-confirmation of the first build on `20260712b1`** (first-click works, no ghost-after-delete, kill-switch A/B reproduces live). Live-check runs in parallel so Lane 1 doesn't idle; if the live-check fails, step 4 pauses and we re-escalate. Suggest the four-family suites (add selection-desync + stale-quick-menu RED coverage — being staged in Lane 4) as the step-4 acceptance contract, matching the TRACKS T1 exit.

### Note for the ledger (build-id coordination — not a decision)
Lanes bumped build id independently: T4 → `20260707b106`, T1 → `20260712b1`. Files are disjoint, so the current tree carries both fixes under the latest id `20260712b1`. Going forward the canonical build id is `20260712b1`; future bumps continue from there. Flagging so the naming lineage is on record.

---

## ESC-004 — T3 rows 2 & 11 isolation checkpoint (D-002 retained checkpoint)

**Date:** 2026-07-12  
**Track:** T3 step 2 → step 3 (Lane 2)  
**RC:** RC-4  
**Urgency:** D-002 requires these findings return to the Director before either fix is dispatched. Lane 2 idles until ruled.

Worker 3 delivered `worker-reports/T3-step2-row2-row11-isolation-report.md` (probe `t3-row2-row11-probe.mjs`; I9 intact — not promoted to gate).

### Row 2 — Ctrl-select collapse (TAL-01498): new mechanism implicated
The RED reproduces (panel B ends `selectedIds: []`), and it implicates **exactly one** mechanism — but **neither of the two D-002 candidates**:
- Candidate (a) inbound coordinate decoration wrong-frame — **ruled out**: panel-B geometry stays separated (center distance 321.77px before *and* after; distinct incoming x-ranges preserved).
- Candidate (b) parent focus-cleanup racing the guard — **ruled out**: no `clearDrawingUiOnOtherPanels` / `deselectDrawingsOnNonFocusedPanels` fired during the failure (only `panel-focus` messages).
- **Implicated:** local panel Ctrl-click **double-toggle** — the same drawing id is `selectDrawing`-selected then immediately `selectDrawing`-toggled back out within one interaction (`c-local-double-toggle`, `localDoubleToggle: true`). Fix would target row 2's panel-local selection dispatch (consistent with the ratified panel-local ownership).

**Decision requested:** acknowledge the updated mechanism and authorize a step-3 gated fix on the panel-local Ctrl-click selection path (single select-vs-toggle decision per interaction).

### Row 11 — Pan bounds (TAL-01491): not reproducible in harness
Measurement probe found host and iframe **effective plot rects identical** (both `584×870`, canvas `639×900`, margins equal; only the expected -641px column offset differs). `offsetX` host −13448.008 vs iframe −13425, candleSpacing 7.002 both. **No plot-rect geometry violation exists in the harness topology** — so the probe does not justify any host-only geometry fix or offset constant.

**Decision requested:** rule on disposition — (i) request a PO live drag-trace (pointerdown/move/up + offsetX deltas) in the exact production layout TAL-01491 was filed against, then re-probe; or (ii) treat TAL-01491 as a retest-close candidate pending the PO retest. Manager recommends **(i)** — capture the live trace before closing, since the harness can neither reproduce nor exonerate it.

### Note
Both rows are the D-002 retained checkpoint; all other step-3 rows proceed without Director involvement once the PO retest defines the survivor set.

---

## ESC-003 — RESOLVED

**Director ruling:** D-003 (2026-07-12)  
**Outcome:** First build accepted. T1 step 4 authorized conditional-parallel (PO live-confirm `20260712b1` while worker proceeds; failed live check pauses step 4). Added constraint: **step 6 (retire legacy `Chart.selectedDrawing`/`Chart.drawings`) is its own gated commit + own kill-switch**, separable from 4/5/7. Build-id lineage ratified at `20260712b1`; future bumps route through the Manager. Lane 1 unblocked.

## ESC-004 — RESOLVED

**Director ruling:** D-004 (2026-07-12)  
**Outcome:** Row 2 fix authorized on the implicated mechanism (panel-local select-vs-toggle per pointer interaction; host Ctrl-click cell untouched; probe RED promoted to gate). Row 11 gets no fix on current evidence — drag-trace folds into the PO retest row; no repro (build id confirmed) = retest-close, repro = bring trace back before any fix; host offset constant explicitly banned. Lane 2 step 3 (Row 2) unblocked.

---

## ESC-005 — T4 order-type behavior: reinstate correct auto-reclassification (reverses part of an accepted deliverable)

**Date:** 2026-07-12  
**Track:** T4 (Lane 3)  
**RC:** RC-5  
**Urgency:** Behavioral — the shipped default-ON T4 build now behaves opposite to what the PO wants; and an accepted invariant is wrong.

### Context (live-verified on `20260712b2`)
PO confirmed in default state (no kill-switches): entry-line drag is smooth, no crash (the earlier d3 `document`-null crash was a kill-switch artifact and is withdrawn). **However**, the PO wants order type to **auto-reclassify by price vs market** — the standard broker mapping:
- Buy below market → **Buy Limit**; Buy above market → **Buy Stop**; at market → **Market** (and mirror for Sell).

### Conflict with accepted T4 step 1 (D-none; accepted by Manager)
T4 step 1 deliberately **froze** order type on drag — it guarded off the auto-detect at `order-manager.js:18789–18837` / `18920–18944` under `__TALARIA_DISABLE_ORDER_AGGREGATES_V2` — to discharge TAL-00752 "limit mutates to stop/market when dragged." It also encoded **property invariant #3: 'order type never mutates on move.'** Both now contradict the PO's required behavior.

### Re-interpretation of TAL-00752
The genuine defect was almost certainly **incorrect** reclassification (wrong direction / limit→market corruption) bundled with the aggregate/PNL math bugs — NOT the existence of reclassification. T4 step 1's aggregate math fix (average/risk-split/PNL) is correct and should stay; only the "freeze order type" decision is wrong.

### Decision requested
1. **Authorize reinstating order-type auto-reclassification** with correct limit/stop/market semantics (by price relative to market, per side), as a **new gated fix** (`window.__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2`), decoupled from the aggregate math (kept) and display/parse (kept).
2. **Revise T4 property invariant #3** from "order type never mutates on move" to "order type reclassifies to the correct limit/stop/market per price-vs-market on move" — RED-first property tests asserting the full mapping (both sides, all three zones, multi-entry legs).
3. Confirm this still discharges TAL-00752 (the reclassification is now correct + aggregates already fixed).

### Manager recommendation
Approve both. Implement as its own gated fix; keep T4 step 1/step 2 switches intact; add the corrected mapping property suite + a live drag spot-check as acceptance. Lane 3 holds this task until ruled; it continues T4 step 3 (replay-interaction) meanwhile.

---

## ESC-005 — RESOLVED

**Director ruling:** D-005 (2026-07-12)  
**Outcome:** Approved after primary-source check (TAL-00752 #17: *"it remains called a market order, even if it was a limit order"* = label failed to update). Reclassification reinstated as gated fix `__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` (decoupled from step-1/step-2). Semantics: below=Limit, above=Stop, at-market (tick tolerance, one unit per I12)=Market; mirrored for sell; each leg independent. Invariant #3 revised + tests replaced (both sides × 3 zones × zone-crossing × multi-leg). PO live spot-check (drag through Limit→Market→Stop) is acceptance. **New standing rule → INVARIANTS P6:** product-behavior invariants must quote their source ticket. Lane 3 unblocked.

---

## ESC-005 — RESOLVED

**Director ruling:** D-005 (2026-07-12)  
**Outcome:** Both requests approved — Director verified the re-interpretation against the source thread (TAL-00752 #17: *"…it remains called a market order, even if it was a limit order"* — the tester wanted the label to update, not freeze). Reclassification reinstated as its own gated fix (`__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2`), standard broker mapping per side, per leg, tick tolerance named with one unit. Invariant #3 revised to "type always equals correct classification for price-vs-market"; full-mapping property suite replaces the old tests. Steps 1–2 switches stay. Acceptance includes PO three-zone drag spot-check. New standing rule: product-behavior invariants must quote the source ticket in acceptance reports.

---

## ESC-003 — RESOLVED

**Director ruling:** D-003 (2026-07-12)  
**Outcome:** First build accepted. Step 4 authorized, conditional-parallel on PO live-confirmation of `20260712b1`. Constraint added: migration step 6 (legacy `Chart.selectedDrawing` retirement) lands as its own gated commit with its own kill-switch, independently revertible; steps 4/5/7 may share one build. Acceptance contract = four family suites + gate + state matrix + 10-ticket spot-check. Build-id lineage ratified at `20260712b1`; future bumps coordinated through the Manager.

---

## ESC-004 — RESOLVED

**Director ruling:** D-004 (2026-07-12)  
**Outcome:** Row 2 — updated mechanism (local Ctrl-click double-toggle) acknowledged; gated fix authorized on the panel-local selection dispatch (one select-vs-toggle decision per interaction), plain-click and single-chart cells unchanged, probe RED promoted to gate with the fix. Row 11 — disposition (i): drag-trace folded into the existing PO retest row using the ticket's exact layout; no repro with build-id confirmed → retest-close; repro → targeted probe before any fix. No host offset constant on current evidence.

---

## ESC-007 — T3 contract intake rows 13–15: approve owner/transport + resolve 2 open questions

**Date:** 2026-07-14  
**Track:** T3 step 1 → step 2 (Lane 2)  
**RC:** RC-4 (rows 13–15 are intake amendment A2/row-15 from `DAILY-INTAKE.md`)  
**Urgency:** Blocks T3 step-2 RED scenarios for the three new rows. Lane 2 is NOT idle (now on TAL-01564 SW-hygiene), so this is not lane-blocking — but the rows can't advance to fixes without ratification, same P4 process as rows 1–12.

### Context
Worker 2 delivered the updated contract (`T3-INTERACTION-PARITY-CONTRACT.md`, 15 rows) + report (`worker-reports/T3-step1-parity-contract-report.md`), docs-only, no engine/React edits (confirmed; legacy `multichart/` untouched). Report meets `WORKER-REPORT-STANDARD`. Proposed owner/transport for the new rows:

| # | Surface | Ticket | Proposed owner | Proposed transport |
|---|---|---|---|---|
| 13 | Layout persistence across refresh | TAL-01571 | Parent shell (V9 React) | `userStorage` save `{layoutId, panelCount, layoutIndex}` on picker change; hydrate before `MultichartGrid` mount (gate `layoutPanels.n > 1`) |
| 14 | Tile geometry / clip (chart fills tile) | TAL-01574 | Parent shell orchestrates bbox; each panel resizes canvas | host: `applyHostSlot` DOM overlay; iframe: `ResizeObserver → chart.resize()` + layout-settle `repaintAllPanelSurfaces` |
| 15 | Symbol-sync ON converges panels to focused ticker | TAL-01586 | Parent shell on toggle edge; focused panel owns source ticker | on false→true: read focused `fileId`, fan `runCommand('loadFile')` to peers (mirror `visibleRange` snap, `multichart-manager.js:181-198`) |

Row 11 also updated in the contract with **TAL-01587 REOPENED** (pointer-capture/`mouseleave` on host tile; live drag-trace mandatory) — consistent with the DAILY-INTAKE Row-11 reopen; no new decision needed beyond D-004's superseded retest-close path.

### Decision requested
1. **Approve rows 13–15 owner/transport** as specced (all parent-shell-owned — consistent with the D-002 ratified split where the parent owns focus/quick-menu/settings/layout chrome).
2. **Row 13 open question:** persist via a **new V9 storage key** vs **extend the existing `chart_panel_state` blob**?
3. **Row 15 open question:** convergence source = **focused panel** (worker-recommended) vs **always host tile A**?

### Manager recommendation
- Approve 1 — the split is consistent with the ratified contract; layout structure/persistence is parent-shell by nature.
- Row 13 → **extend the existing `chart_panel_state` blob** (add a `layout` field) rather than a second key, to keep a **single persistence owner** and avoid restore desync between two stores (a fresh key risks the two drifting on partial writes). Only split to a new key if the existing blob is per-panel-content-scoped and can't carry layout-level structure — Worker 2 to confirm the blob's scope in step 2.
- Row 15 → **focused panel** as source. "Always host tile A" is surprising when the user has focused another panel to sync from; focused-panel matches the ratified "focused panel owns source ticker" model and the PO's spec wording ("converge all panels to the same ticker (the focused/host panel's)").
- Row 11 → no new ruling needed; proceed under the DAILY-INTAKE reopen (live drag-trace mandatory before any fix).

---

## ESC-007 — RESOLVED

**Director ruling:** D-008 (2026-07-14)  
**Outcome:** Rows 13–15 owner/transport ratified (all parent-shell, consistent with D-002). Row 13 = extend `chart_panel_state` blob (worker confirms schema fits; corrupt-value fallback to single layout is mandatory and in the RED; structure-only restore). Row 15 = focused-panel source, **toggle-edge only** (boot/panel-added cells out of scope without new PO spec; no-fileId-at-edge behavior stated in fix spec); fan-out via existing `runCommand('loadFile')`. I13 binding on all three (React files gated; acceptance = `build:live` + parity checklist, not harness). RED scenarios may start now; fixes sequence after TAL-01564 by evidence readiness.

---

## ESC-008 — A3 replay mode/cadence: authorize 2 fix tasks + rule on the TAL-01582 behavioral fork

**Date:** 2026-07-14  
**Track:** A3 (Lane 3), diagnostic on build `20260712b8`  
**RC:** RC-5 adjacent (plan-2 amendment A3)  
**Urgency:** Not lane-blocking (Lane 3 proceeds on ruling-independent harness prep) — but the fixes can't land without the behavioral ruling.

### Context
Lane 3 delivered `worker-reports/A3-lane3-replay-mode-cadence-diagnostic-report.md` (per WORKER-REPORT-STANDARD; diagnostic-only, no edits, mirror confirmed byte-identical). Root cause: replay **interval ownership is split across three stale layers** — the V9 slider writes a dead `_replayIntervalRawCandles` field the engine no longer reads; the canonical `setStepTimeframe()`/`stepTimeframeOverride` path is used only by multichart iframe sync; and the hidden-select `change` handler is a no-op. Two separate mechanisms:
- **(a) TAL-01582:** `play()` gates `useTickAnimation = tick && !explicitInterval`, so any path that sets `stepTimeframeOverride` (multichart sync) silently falls back to the candle loop while the UI still shows "Tick."
- **(b) TAL-01581:** step size reads the hidden select while routing/sync read the override → inconsistent bucket math (4h-interval-on-4h-TF/1m-master = 240-bar jumps), double-step on play start, intermittent edge stalls.

### Decision requested
1. **Authorize two gated fix tasks** (two kill-switches, per the worker's §3): `__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING` (a) and `__TALARIA_FIX_REPLAY_INTERVAL_CADENCE` (b), sharing a small prelude (wire the V9 slider → `setStepTimeframe`, delete the dead field).
2. **Rule on the (a) behavioral fork** (product decision, like D-005): when Tick mode has an explicit interval set — **(A)** allow tick animation with the interval controlling step boundaries only, or **(B)** force the candle path but update the UI/label so mode matches behavior? PO input likely needed.

### Manager recommendation
Approve (1). For (2), recommend **(A)** — the user selected Tick deliberately; the interval should bound steps, not silently override the mode. Fix (b) lands first (pure correctness, no fork), fix (a) after the (A)/(B) ruling. Each RED-first against the new replay-mode harness scenarios (Lane 3 authoring now). P6: both tickets quoted in the report.

---

## ESC-009 — Iframe-panel toolbar fix has failed live 3× despite fast-loop green; dev:live is not a faithful acceptance surface

**Date:** 2026-07-14
**Track:** T1 (Lane 1), build `20260712b11` (PO-confirmed on host AND panel B)
**RC:** RC-1 / tooling-fidelity
**Urgency:** Recurring wasted deploy cycles; erodes confidence in "DONE (proven)" for multichart.

### Pattern
Steps 11, 12, and 13 each reported deterministic GREEN on the **dev:live fast loop** (step 13: 20/20) and each **failed the real server iframe panel**: panel B still renders the OLD engine `#drawing-toolbar` on a build-id-confirmed `b11`. Step 13's own report noted "build:live + Docker PO path not run in this session." The dev:live mount shares context with the parent, so parent-global-based suppression works there but not inside the real cross-window iframe — the fast loop cannot reproduce the exact defect.

### Decision requested
1. **Standing rule:** for **iframe-panel multichart** fixes specifically, dev:live fast-loop green is **necessary but not acceptance** — acceptance requires **real built-product verification** (`build:live`/served build, or Lane 4's T0-step8 React-parity harness driving the real `MultichartGrid`), with build id confirmed inside the panel iframe.
2. **Sequencing:** gate future iframe-panel toolbar/selection fixes on **T0-step8** (automated real-React parity harness) landing, so we stop shipping fast-loop-green/live-broken. Step 14 (dispatched now) already requires real-product proof + screenshot.

### Manager recommendation
Approve both. Step 14 is already written to (a) fix via a reliable in-iframe signal posted by the parent bridge (not parent globals) and (b) require real-product 10× proof. Recommend making T0-step8 the durable gate for this whole family. This is the D-006 blind spot recurring — the parity check must become real, not dev:live.

## ESC-010 — Real-iframe harness reveals broad panel-B interaction breakage; per-surface vs consolidated-root decision

**Date:** 2026-07-14
**Track:** T1 (Lane 1) ∩ T3 (Lane 2), build `20260712b26` (local built dist-v9)
**RC:** RC-1 / RC-4
**Urgency:** Scope/architecture decision — determines whether the next 5–6 fixes are separate steps or one consolidated fix. Not lane-blocking (15/16 + T3 rows in flight).

### Finding
Now that T0-step9 runs the parity rows **faithfully on real iframes**, panel-B interaction is broken across **seven** surfaces (only blue-border H-R02 and Ctrl-click H-R03 pass): H-R01 single-click shows **no parent V9 quick bar**, H-R04 dbl-click→settings, H-R05 Esc leaves chrome selected, H-R06 delete doesn't remove, H-R07 peer isolation fails, H-R08 marquee inactive, H-R09 click chain broken. Registered HR-PARITY#1–#8. The dev:live-only history hid all of this.

### The decision
H-R01 (a panel-B selection never produces the parent V9 quick bar) is very likely the **root**: settings-open, Esc-deselect, delete-routing, and the click chain all cascade from selection→parent-chrome routing being incomplete across the iframe boundary. So:
1. **Confirm the common root** with one diagnostic (does driving panel-B selection→parent V9 chrome over the bridge collapse H-R01/04/05/06/09 together?), before dispatching any more per-surface fixes.
2. **Then choose:** (a) continue per-surface I14 steps (17, 18, …), or (b) **one consolidated panel-B interaction-parity fix** — parent chrome subscribes to panel-B selection over the postMessage bridge (I14), HR-PARITY rows as the acceptance contract. Owner: T3/Lane 2 (RC-4 interaction parity) coordinating the I14 transport with Lane 1.

### Manager recommendation
Approve the diagnostic-first path and, if the common root is confirmed, **(b) the consolidated fix owned by T3/Lane 2** — this is exactly the root-not-symptom mandate; six per-surface steps would repeat the loop we're closing. Keep steps 15/16 (concrete, in-flight, turn H-R13/H-R14 green) as-is; peer isolation (H-R07) is already a T3 contract row. HR-PARITY#1–#8 are the ratchet. Hold new per-surface steps beyond 16 until the root is confirmed.

## ESC-010 — RESOLVED

**Director ruling:** D-011 (2026-07-14). Diagnostic-first approved; consolidated fix (b) pre-authorized (no round-trip). **+Mandatory step 0 fallback-posture A/B** (b26 = fallback-B; re-run failing HR-PARITY rows with migration switches ON in-panel — vanishing failures = our rollback, future re-migration scope, not defects). **Scope fence:** selection→parent-chrome routing only, T3/Lane 2 owns, Lane 1 engine-side emit as separate gated commit; H-R07/H-R08 stay separate unless proven to collapse with root. Acceptance = HR-PARITY green on real-iframe harness + parity checklist on built product (not dev:live). Steps 15/16 continue; per-surface beyond 16 held until diagnostic returns.

## ESC-008 — RESOLVED

**Director ruling:** D-009 (2026-07-14). Both replay fixes authorized — cadence correctness first (`__TALARIA_FIX_REPLAY_INTERVAL_CADENCE`), mode-play routing second (`__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING`). Fork ruled **(A)**: tick persists, interval bounds step size only, UI shows both. Acceptance = harness green + PO live confirm (Tick+4h → tick animation, 4h step bounds). Lane 3 free to dispatch.

---

## ESC-010 — RESOLVED

**Director ruling:** D-011 (2026-07-14)  
**Outcome:** Diagnostic-first approved (timeboxed, discriminating evidence per row). **Mandatory step 0 inside the diagnostic: fallback-posture A/B** — re-run failing HR-PARITY rows with the retained migration switches ON in the panel; failures that vanish are re-migration scope (our deliberate rollback), not defects. On root confirmation, consolidated fix **(b) pre-authorized** (no second escalation): parent V9 chrome subscribes to panel-B selection via postMessage (I14), owned by T3/Lane 2 with Lane 1 providing the engine emit as a separate gated commit; scope = selection→parent-chrome routing only (no wholesale fallback reversal; H-R07/H-R08 stay on their own tracks). Acceptance = HR-PARITY rows green on the real-iframe harness + PO parity checklist (per D-010). Root refuted → per-surface resumes with evidence re-escalated. Steps 15/16 continue; per-surface beyond 16 held.

---

## ESC-009 — RESOLVED

**Director ruling:** D-010 (2026-07-14). Both requests approved + 1 modification + 2 additions: (1) real built-product acceptance surface for parent↔iframe fixes (build id confirmed inside the panel iframe); (2) T0-step8 durable gate but **not** hard serialization — near-term fixes (step 14) accept via manual real-built path; (3) **new INVARIANTS I14** — postMessage-bridge-only, parent globals forbidden in panel-facing paths; (4) report-labeling correction — mislabeled "DONE (proven)" → **Manager bounces**; (5) T0-step8 raised to Lane 4 top item with hardened exit (real MultichartGrid, real separate-window iframes, build-id assert per panel, one regression scenario per burned fix: gear route / settings flash / marquee-in-panel).

---

## ESC-009 — RESOLVED

**Director ruling:** D-010 (2026-07-14)  
**Outcome:** Both requests approved, one modification. (1) For any parent↔iframe-boundary fix, dev:live green = development evidence only; acceptance = real built product with build id confirmed **inside the panel iframe**. (2) T0-step8 is the durable gate but NOT a hard serialization — near-term iframe fixes may accept via the manual `build:live`+served path (step 14 proceeds as written). New binding mechanism rule: parent↔iframe coordination must use postMessage bridges — parent globals/same-context assumptions forbidden in panel-facing paths (dev:live shares context and structurally cannot represent the boundary). Report-labeling corrected: unrun acceptance path = "NEEDS-LIVE", never "proven"; Manager bounces mislabeled reports. T0-step8 raised to Lane 4's top item; its exit includes real iframes + in-panel build-id assertion + one regression scenario per burned fix (gear, settings-flash, marquee).

---

## ESC-008 — RESOLVED

**Director ruling:** D-009 (2026-07-14)  
**Outcome:** Both fixes authorized (`__TALARIA_FIX_REPLAY_INTERVAL_CADENCE` first — pure correctness; `__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING` second). Fork ruled **(A)** on P6 grounds (tester's TAL-01582 wording is a complaint that the mode changed): tick persists, interval bounds steps only; UI must reflect both mode and interval. PO live-confirm of (A) is part of (a)'s acceptance — if overruled live, (B) swaps in via the switch, no redesign. Prelude rides (b)'s switch; switch-off cell must render today's behavior. State matrix must cover the multichart `stepTimeframeOverride` consumer.

---

## ESC-011 — OPEN (P0 / high-risk crossroads) — multichart interaction fixes are FALSE-GREEN; acceptance harness gave false positives

**Date:** 2026-07-14 · **Filed by:** Manager · **Severity:** P0 (reverses status of T1/T3 interaction family + systemic acceptance-integrity failure)

### What happened
Two independent signals converged:
1. **PO live test:** gear/settings button no longer opens the settings menu on **Panel A OR Panel B** (Panel A worked before).
2. **Lane 4 honest-probe reconcile (T0 step 11):** Lane 4 fixed the `readParentReactSettings` harness probe, which previously counted the V9 quick-bar shell as "settings open" (false green). With the **honest probe on the true combined build `20260712b88`** (verified to contain routing V3, peer-deselect V1, `deleteSelectedDrawings`, `dismissActiveDrawingTool`, A3, order-entry family 1):
   - **GREEN (genuine):** H-R01 (select→chrome), H-R07 (peer isolation), H-R02, H-R03.
   - **RED (genuine failures):** H-R04, **H-R05 (Esc)**, **H-R06 (Delete)**, **H-R12 (gear→settings)**, **H-R13 (dbl-click→settings)**, **H-R14 (marquee)**, H-R08, H-R09.

### The finding
The "10/10 GREEN" acceptance proofs for **T1 step 15 (H-R13), step 16 (H-R14), step 17 (H-R05/H-R06)** and the settings chain in **T3 step 4 (H-R04)** were **false greens** — they passed against (a) a probe that mistook the quick-bar shell for the settings modal, and (b) **synthetic in-iframe events** (synthetic dblclick / handleKeyDown / ctrl-drag) rather than real user actuation. On the honest harness + real product, these interaction fixes **do not work**. Not the workers' fault — the T0 harness was structurally unable to see the truth; this is precisely the D-010/ESC-009 blind spot, now proven material.

### Impact
- The multichart interaction batch (settings-open, Esc, Delete, marquee) is **NOT shippable**. b88 is confirmed broken (harness + live). Deploy remains frozen.
- T1/T3 interaction status must be marked down materially. Only select→chrome (H-R01) and peer-isolation (H-R07) are genuinely green.
- We still have a **second fidelity gap** below the probe: the harness actuates with synthetic events inside the iframe, not real mouse/keyboard — so even the honest probe may over-pass.

### Manager actions already taken (no ruling needed to proceed)
- Deploy frozen; recommending the **live product stays on fallback-B** (last known-good multichart posture) until the interaction family genuinely passes.
- Did **NOT** accept Lane 4's 8-row baseline as "acceptable" — it is an **honest snapshot of what is broken**, not a green light. The gate "passing" with 6 supposed-fixes in known-failing is not acceptance.
- Lane 1 P0 re-fix dispatched (T1 step 18) against the **honest harness + real product**, covering the gear + dbl-click + re-verifying Esc/Delete/marquee.

### Decisions requested from the Director
1. **Re-verification mandate:** ratify that every multichart interaction row must be re-proven on the **honest probe** AND against **real actuation** (not synthetic in-iframe events) before any "proven" claim — i.e., raise the T0 acceptance bar (harness actuation fidelity), or accept synthetic actuation + mandatory PO live-confirm per row as the bar.
2. **Shipping posture:** confirm the live product stays on **fallback-B** until the interaction family is genuinely green (vs. shipping the partial-green subset H-R01/H-R07 now behind switches).
3. **Root vs per-surface, again:** the settings-open family (H-R04/H-R12/H-R13) all failing together on the real product suggests a single settings-open transport root (gear + dbl-click both fail to open the real modal from a panel). Authorize a **consolidated settings-open-transport fix** (one root) rather than per-row, owned by Lane 1 with Lane 4 providing an honest gear-specific + modal-specific harness assertion. Esc/Delete/marquee re-verified separately.
4. **Harness actuation:** approve a Lane 4 task to add **real-event actuation** (real cross-frame mouse/keyboard, e.g. CDP `Input.dispatch*` at true coordinates into the panel iframe) so the harness stops relying on synthetic dispatch that bypasses the real product path.

### Manager recommendation
Grant (1) honest-probe + real-actuation as the new bar; (2) stay on fallback-B; (3) consolidated settings-open-transport fix (root, not per-row); (4) yes to real-event actuation. Keep H-R01/H-R07 (genuinely green) as the ratchet floor. Treat Lane 4's honest baseline as the new truth and drive the RED rows to green against it.

### ADDENDUM (2026-07-14, after T0 step 12 honesty audit) — worse than first stated
Lane 4's full harness honesty audit (`T0-step12-harness-honesty-audit-report.md`) found the false-green disease is **not confined to the settings probe** — it pervades the multichart suite:
- **Even the "genuinely green" rows are NOT trustworthy:** H-R07 asserts only `!toolbarVisible` (selection can desync while chrome looks cleared); H-R01/H-R02/H-R03 panel-B green via real mouse **+ a `selectDrawing`/`editDrawing` fallback** that bypasses broken iframe hit-test routing; borders asserted via resize-handle counts; H-R04 "dbl-click opens settings" only checks the click dispatched, not that settings opened; host H-S32/H-S33 pass on `toolbarVisible` proxy / fully-synthetic `editDrawing`.
- **Conclusion:** there is currently **NO trustworthy automated coverage of multichart interaction**. The retracted ratchet floor (H-R01/H-R07) does not hold. **PO live-confirm on the real product is presently the only reliable acceptance authority** for multichart.
- **Sequencing consequence:** fixing the product (step 18) against this harness risks another false-green. The measurement must be repaired **before or alongside** the fix. Recommended order: **(A) Lane 4 rebuilds the harness with real cross-frame actuation (CDP `Input.dispatch*` into the panel iframe at true coords) + real-state assertions (message-open + visible modal + `hasStyleSection`; store-level deselect for H-R07), removing all `selectDrawing`/`editDrawing` synthetic fallbacks; THEN (B) Lane 1's settings-open root fix is proven against the rebuilt harness AND PO live-confirm.** Interim acceptance for any multichart fix = **PO live-confirm on real built product** until the harness is honest.
- **File-collision note:** `react-parity-lib.mjs` cannot be edited by Lane 1 (step 18) and Lane 4 (rebuild) simultaneously — they must be sequenced. Manager is holding Lane 4 on a read-only real-actuation implementation spec until this is ruled + the file is free.

### Additional decision requested
5. **Sequencing:** approve "harness-first" (Lane 4 real-actuation rebuild before/with Lane 1's fix), with **PO live-confirm as the interim acceptance authority** for multichart until the harness is honest. If the Director prefers "fix-first with PO live-confirm and harness-rebuild in parallel later," say so and I'll re-sequence.

## ESC-011 — RESOLVED

**Director ruling:** D-012 (2026-07-14) + new invariant **I15**.
**Outcome:** (1) ALL previously "proven" multichart interaction rows retracted (incl. H-R01/H-R07); until the harness is rebuilt honestly, a multichart interaction fix is accepted ONLY by PO live-confirm on the real built product. (2) Live stays **fallback-B**, deploy freeze continues — nothing from this family ships until genuinely green + PO-confirmed. (3) **One consolidated root fix authorized** for the settings-open family (gear + dbl-click + settings row = one broken transport) — *already delivered by T1 step 18, real-mouse + honest probe, PO-confirmed 4/4; needs staging live-confirm.* (4) **Lane 4 rebuilds the harness** with real cross-frame input at true coords + real end-state assertions, removing every synthetic shortcut; broken real routing MUST show red. (5) **Sequencing = harness-first with a twist:** Lane 4 gets *exclusive* ownership of the harness file; Lane 1 works in parallel **diagnostic-first** (trace transport roots on the real product) so fixes are ready when honest measurement exists; if the rebuild drags, a fix may be accepted on PO live-confirm alone but only to a **staging** build. (6) **I15 (standing rule):** no test may assert a proxy for what the user sees — every green names how it actuated + what it measured; synthetic green can never be "proven".

---

## ESC-011 — RESOLVED

**Director ruling:** D-012 (2026-07-14)  
**Outcome:** All five requests granted, one modification. (1) Two-tier re-verification bar: permanent bar = honest probe + **real actuation**; until the harness meets it, synthetic green is development evidence only and **PO live-confirm on the real built product is the sole acceptance authority** for multichart interaction. All previously "proven" rows retracted to UNPROVEN — including H-R01/H-R07 (ratchet floor withdrawn per the step-12 addendum); T1 steps 15/16/17 + T3 step-4 settings chain marked **RETRACTED-FALSE-GREEN**, their registry rows reopened. (2) Live stays on **fallback-B**; deploy freeze continues; no partial-green shipping. (3) **Consolidated settings-open-transport fix authorized** as one root (gear + dbl-click + H-R04), owner Lane 1, one switch, I14 transport; Esc/Delete/marquee re-verified separately. (4) Lane 4 real-event actuation rebuild **approved** (CDP input into the panel iframe at true coords, real-state assertions, all synthetic fallbacks removed; host H-S32/H-S33 get the same honesty pass). (5) Sequencing = **harness-first with a bounded parallel diagnostic**: Lane 4 owns `react-parity-lib.mjs` exclusively until the rebuild lands (Lane 1 forbidden from that file); Lane 1's step 18 re-scoped diagnostic-first (trace the transport root on the real product, no harness-lib edits), may implement the gated fix but no acceptance claim until the rebuilt harness goes RED→GREEN AND PO live-confirms; interim path = PO-live-confirm-only acceptance to a **staging build** if the rebuild is slow. New **INVARIANTS I15**: no proxy assertions, real actuation only; every GREEN claim names probe + actuation method; synthetic green = GREEN-SYNTHETIC, never "proven."

---

## ESC-022 — Order levels invisible off-plot: authorize chart.js Y-domain inclusion (Option A / C)?

**Filed:** 2026-07-16 (Manager)  
**Status:** OPEN — awaiting Director ruling  
**Class:** scope + freeze-risk decision (chart.js autoscale behavior change)

### Context
PO live report: placing an order/pending order shows it in the trades panel but **no level line appears on the chart until price reaches the level**. Lane 3 read-only diagnostic (`ORD-LEVEL-VIS-diagnostic-report.md`) confirmed root cause:
- `chart.js calculateScales()` (~24020–24145) computes the Y-domain from **visible OHLC + last price only** — order/pending entry prices are excluded.
- Lines ARE created (`drawPendingOrderLine`), but `_applyOrderRowMainPlotVisibility` (~39255) sets `display:none` when `yScale(price)` is off-plot; `drawYAxisPriceHighlight` (~24272) also bails. No edge marker exists today.
- Open positions behave identically; panel B (per-iframe chart) identical.

### Manager action already taken (no ruling needed)
- **Option B (off-screen edge marker)** dispatched to Lane 3 as a **freeze-safe** fix: `order-manager.js` only, kill-switch `__TALARIA_DISABLE_ORDER_OFFSCREEN_MARKER_V1`, honest REDs `RC5-ORD-LEVEL-VIS-1/2/3`. This restores "you can always see where the order sits" without touching chart.js. This proceeds regardless of the ruling below.

### Decision requested
Do you authorize **Option A** — expanding the `chart.js calculateScales()` Y-domain to optionally include active order/pending levels (so the full line is visible, not just an edge marker) — which combined with B is **Option C (best UX)**?

Trade-offs the Director owns:
1. **Freeze-risk:** `chart.js` is the frozen core; autoscale is on the hot render/replay path. An edit here risks the interaction family we're about to bless.
2. **Behavior change for everyone:** including levels means a far order **pulls the axis** and compresses candles — some traders dislike this. Would need its own kill-switch and likely a user preference (opt-in "keep orders in view").
3. **Timing:** even if approved, it should land **after** the combined-build bless (post-unfreeze), not now.

### Manager recommendation
- **Ship Option B now** (freeze-safe, solves the complaint).
- **Defer Option A** to post-unfreeze, and only as an **opt-in** ("keep orders in view" toggle, default OFF) behind its own switch, so default autoscale is unchanged. If the Director agrees, no chart.js edit happens during the freeze and B is the interim answer.
- If the Director wants full lines immediately, rule on accepting the chart.js freeze-risk + whether axis-pull is default-on or opt-in.

---

## ESC-022 — RESOLVED

**Director ruling:** D-025 (2026-07-16)  
**Outcome:** Manager recommendation adopted in full + scope precision. (1) **Option B endorsed as dispatched** — freeze-safe edge marker is the interim answer and the actual bug fix (registry row cites B). (2) **Option A approved, post-unfreeze only, opt-in "keep orders in view" default OFF**, own kill-switch (independent revert from B); queues with the other post-unfreeze chart.js work (A6-4, Phase 7) so the frozen core reopens once, deliberately. (3) **Implementation bounds:** domain inclusion = active order/pending **entry levels only** (SL/TP legs excluded by default, later toggle refinement if PO wants); inclusion is **bounded** — a level beyond a sane multiple of the visible range falls back to B's edge marker instead of stretching the axis (fat-finger protection). (4) **Option C UX contract:** toggle OFF = default autoscale + edge markers; toggle ON = bounded inclusion + marker beyond the bound. PO staging A/B of both postures = Option A acceptance.

---

## ESC-023 — Panel-B settings-open transport is a real intermittent race (beyond D-024); authorize gated Lane 1 transport fix + correct the H-R04/H-R05 record

**Filed:** 2026-07-16 (Manager)  
**Status:** RESOLVED — **D-026** (2026-07-16): transport fix authorized with mechanism-first fence (name the dismisser, causal cure; guard-widening only as defense-in-depth); proof bar ratified **plus amplified stress leg** (10/10 with `focusReactPanelSoft` in place); H-R04/H-R05 record corrected (never genuinely green — lucky run, not false-green); bless stays blocked, sequence amended; A7 stays out of this build.  
**Class:** real product defect, fix scope beyond an existing ruling (D-024) + honesty correction to prior "green" claims.

### What the reconciliation proved
Lane 1's reconciliation (`T3-panelB-settings-transport-reconcile-report.md`) resolved the Worker 1 (10/10) vs Lane 4 (0–4/10) contradiction on the same build id:
- **(A) stale/incomplete dist — RULED OUT.** Served `dist-v9` contains the D-024 fix (markers verified, byte-identical both I8 trees, built after `2537d3d0b`). No rebuild needed.
- **(B) TRANSPORT — root cause.** Panel-B iframe dbl-click → parent V9 settings modal is a **genuine intermittent product failure** measured with the honest real-modal assertion (`hasStyleSection`). Failure signature `{open:false, hasStyleSection:false, quickBarShellOnly:false}` **after** the dbl-click actuates and **after** dom-ready honestly reports `panelId:B, domReady:true`. D-024 fixed chrome **readiness ordering**; it did NOT fix the **settings-open transport** (`requestMultichartParentDrawingSettings` → `MultichartGrid.openDrawingSettingsForPanel` ~5281). The modal isn't invoked in time, or is dismissed by a peer-clear/focus side-effect before it mounts, within budget.
- **(C) harness exacerbation.** Lane 4's `focusReactPanelSoft` before the panel-B dbl-click worsens it (0/10 vs 6/10 Worker-1-style) — amplifies, not causes. Lane 4 owns that adjustment.

### Honesty correction (I15) — important
Worker 1's earlier **H-R04 10/10 / H-R05 9/10 was a timing-lucky run, not a false-green** (same honest `hasStyleSection` probe). Re-run today on the verified-fresh dist = **6/10**. Therefore **H-R04 and H-R05 were never genuinely green** — they are an intermittent transport race that luck masked. The re-migration ENGINE rows (H-R02/H-R03/H-R06/H-R07) are unaffected — those passed 10/10 with real switch-OFF discriminators and are solid. This is confined to the panel-B settings-open surface.

### Why it needs the Director
1. **Scope beyond D-024.** D-024 authorized readiness-ordering only ("transport untouched"). The fix now needs to touch the **settings-open transport**: `MultichartGrid.openDrawingSettingsForPanel` (~5281), `requestMultichartParentDrawingSettings` (~236), and the dismiss/peer-clear guard window (`__v9DrawingSettingsOpenGuardUntil`). `MultichartGrid.jsx` is re-migration territory.
2. **Likely closes real tester pain.** This is almost certainly the root of the historical "settings opens only on 2nd/double-click" tickets D-024 flagged for retest — so it's a genuine fix, not a harness chase.

### Decision requested
Authorize a **gated Lane 1 settings-open transport fix**:
- Switch `window.__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1` (default ON = fix enabled).
- Likely touch: `openDrawingSettingsForPanel` (coalesce/guard the open against the peer-clear dismiss), `requestMultichartParentDrawingSettings`, extend `__v9DrawingSettingsOpenGuardUntil`.
- **Proof bar:** H-R04 panel-B **10/10** AND H-R05 panel-B **10/10** isolated ON with honest `hasStyleSection`; switch-OFF honest RED. Lane 4 removes/defers `focusReactPanelSoft` (item C) and re-runs.
- Then the standard bless (3× clean gate:react + manager gate 0-regr) on the re-cut build.

### Manager recommendation
Authorize the gated transport fix as scoped. Keep the bless blocked until H-R04/H-R05 panel-B reach honest 10/10 (no lucky-run acceptance). Do NOT fold A7 indicator-perf into this build — land it separately after bless for clean attribution.

### ADDENDUM (2026-07-17) — pinpoint complete, exact mechanism + ready hunk
Lane 1 read-only pinpoint (`T3-panelB-settings-transport-pinpoint-report.md`) traced GREEN vs RED and found the exact dismiss:
- Panel-B Style panel **does mount** on RED (`hasStyle=true`), then is torn down. Sequence: duplicate dbl-click → two open cycles in ~80ms (each zeroes+re-arms the guard via `v9DismissAllDrawingSettingsImmediate`, `TalariaV8bLive.jsx:15461`) → late `multichart-drawing-selected` (+134ms) coincides with an iframe **background deselect** (`deselectAll({fromCanvasBackground:true})`) → iframe posts `multichart-drawing-deselected` → `MultichartGrid.jsx:6501-6505` dispatches `multichart-dismiss-drawing-settings` **without checking the guard** → `onDismissMcSettings` (`TalariaV8bLive.jsx:19888`) sees `guard=null` → `v9DismissAllDrawingSettingsImmediate` closes the fresh panel; iframe selection lost.
- **Root:** guard is not *expired* (1500ms) — it is **cleared mid-open** and **not honored** on the `multichart-drawing-deselected` path. GREEN differs only by the absence of the post-open deselect→dismiss chain.
- **Ready gated fix (3 hunks, preview in report §5), switch `__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1`:** (A) don't zero the guard in `v9DismissAllDrawingSettingsImmediate` while a panel-B open is in flight + extend ~200ms past open; (B) honor guard + `editingDrawingRef` on the `multichart-drawing-deselected` handler and `onDismissMcSettings` (skip flash-close while open in flight); (C) coalesce duplicate opens for same source+drawingId within ~120ms.
- **Scope note:** touches `TalariaV8bLive.jsx` + `MultichartGrid.jsx` (re-migration files) but fully kill-switched and confined to the settings-open dismiss ordering. Fits the combined build (settings family), appropriate to land before bless.
- **Manager ask unchanged:** authorize implementation of this exact scoped hunk; proof bar H-R04+H-R05 panel-B honest 10/10 ON / RED OFF.

**ADDENDUM RESOLVED — D-026 addendum ruling (2026-07-17):** pinpoint accepted as satisfying the mechanism-first fence; 3-hunk implementation authorized with binding classification — **hunk B (honor guard on the deselected/dismiss path) is the causal cure and cannot be dropped; hunk C is legitimate dedupe (second instance of the duplicate-actuation family, alongside H-R03); hunk A's guard extension is defense-in-depth only.** Proof bar restated in full: 10/10 ON + switch-OFF RED **+ 10/10 with the `focusReactPanelSoft` amplifier in place** (the addendum's ask omitted the stress leg — it stands). Non-blocking follow-up: log why the iframe fires `deselectAll(fromCanvasBackground)` during a dbl-click-on-drawing as a registry row (possible hit-test defect), not as scope creep here. I13 switch-OFF diff + own-PR hunk-staging riders unchanged.

---

## ESC-024 — I9 ratchet vs. intermittent flakes: gate cannot reach exit 0 when tracked flakes pass green; authorize a first-class "quarantine-flake" bucket

**Filed:** 2026-07-17 (Manager)  
**Status:** RESOLVED — **D-027** (2026-07-17): quarantine bucket authorized as scoped; Criterion 5 re-worded (clean gate = 0 unexpected regr + non-quarantine known-failing FAIL as expected + quarantine tolerated). Four hardenings added: quarantine rows still run and print in every gate summary (ratchet-neutral, never invisible; 100%-fail drift re-escalates); entry requires completed flake-triage with run counts; **no bless-path discriminator/acceptance row may ever be quarantined**; >5 rows or overstay past the post-bless T8 review auto-escalates. Never fix-counted/ticket-closing ratified; H-S30 peer-B backfill registered as post-bless T8 candidate; bless stays gated on D-026, not this exit code.  
**Class:** harness/gate contract change (I9 ratchet semantics) — affects the unfreeze gate definition (Criterion 5)

### What Lane 4 hit (`T0-lane4-track-hs30-report.md`)
Three replay rows — **H-S27, H-S30, H-S83** — are genuine **intermittent flakes** (e.g. H-S30: host guard healthy, peer-B 1h backfill fails ~60% in isolation; not caused by any shipped fix; not fix-counted). They were re-added to `known-failing.json` in both I8 trees with triage-specific reasons.

Manager-gate result this cycle:
- **Criterion 5 (no unexpected regressions): CLEARED.** The prior H-S30 block is gone; no unexpected reds.
- **But full `[gate]` PASS did not land (exit 1).** Reason is purely mechanical: `gate.mjs`'s **I9 ratchet requires a tracked known-failing row to FAIL in-run** for exit 0. This cycle all three flakes happened to **pass green while tracked**, so the ratchet flags the baseline as stale and wants them **removed**.

### The flake trap (why neither current option works)
- **Leave them in known-failing:** when they pass green (like this cycle), ratchet → exit 1 ("remove these, they're fixed").
- **Remove them (mark fixed):** next run they fail (~60% for H-S30) → **unexpected regression** → exit 1, and dishonestly claims a fix that doesn't exist (I15 violation).
- There is today **no bucket for "allowed to pass OR fail"** — `known-failing` means *expected-to-FAIL*, which an intermittent row is not.

### Why it needs the Director
The `known-failing`/ratchet contract is an I9 invariant and it defines **Criterion 5** of the unfreeze gate. Changing what a clean gate *means* (accepting quarantined flakes) is a gate-semantics decision, not a Manager call. It also must not become a laundry chute for real bugs.

### Decision requested — authorize a first-class "quarantine-flake" classification
- Add a named **`quarantine`/`flaky` allowlist** to the harness (distinct from `known-failing`) whose rows are **tolerated on either outcome** (pass or fail) and do **NOT** trip the ratchet in either direction.
- Rows: **H-S27, H-S30, H-S83** move here with their triage reasons + measured fail-rate.
- **Guardrails (so it's honest, not a dumping ground):** (1) each quarantine row carries a mandatory reason + a **post-bless T8 owner** to actually diagnose/fix or prove it pure-harness-noise; (2) quarantine rows are **never fix-counted** and **never close a ticket**; (3) entry requires a completed flake-triage (like H-S30's); (4) a periodic review empties it — quarantine is a holding pen, not a graveyard.
- **Gate definition update:** a clean gate = **0 unexpected regressions + all non-quarantine known-failing rows FAIL as expected + quarantine rows ignored**. `exit 0` becomes reachable deterministically.

### Manager recommendation
Authorize the quarantine bucket as scoped. It's the honest resolution (I15-clean: we're not faking a FAIL to satisfy the ratchet, nor faking a fix). H-S30's peer-B ~60% backfill is registered as a **post-bless T8 candidate** (may be real unnecessary backfill, not pure noise) — not closed, not counted. Bless remains gated on the **real** blocker (D-026 panel-B settings transport reaching honest 10/10), not on this mechanical exit code.

---

## ESC-025 — Anchored/Fixed-range Volume Profile axis-crush (R2) needs the `chart.js` `PRICE_AXIS_MIN_R` floor ported to production; authorize pull-forward or confirm post-unfreeze?

**Filed:** 2026-07-17 (Manager)
**Status:** RESOLVED — **D-029** (2026-07-17): Manager recommendation adopted — **no `chart.js` edit before the bless**; option 1 authorized NOW as **item #1 of the post-bless `chart.js` batch** (own gated build/PR, does not wait for A6-4/Option A/Phase 7 readiness). Proof bar: RED-first **in the multichart topology** (single-panel can't carry it), switch-OFF discriminator from birth, full gate + **D-026 proof-bar re-run** on the clamp-inclusive build. Plus: **dev-only-clamp parity sweep ordered** (read-only inventory of `chart-host.html`-and-kin fixes production never got — D-010-cousin risk pattern); tester workaround (remove tool) noted on the A7b row. Lane 5's refusal to touch the frozen core commended.
**Class:** freeze-risk decision (`chart.js` core edit during the interaction-family freeze)

### Context
Two separate anchored-VP defects surfaced on PO live test:
1. **P0 whole-chart freeze — FIXED (Lane 5, freeze-safe).** Root was a **regression we introduced**: RC-3 anchoring (`ce3b28d2`) caused mutual recursion `resolveDrawingPoints` ↔ `resolveAnchoredVolumeProfileRange` → stack overflow on placement. Cured causally in the drawing modules (anchor reads `pointsFromTimestamps`), + render-storm guard + bin cache. Placement now ~35ms, responsive. H-S42 anchor-survives-TF PASS. This part needs no ruling.
2. **R2 axis-crush — pre-existing, separate, NOT fixed.** In multichart, placing anchored/fixed-range VP makes the price+time **scales vanish** (chart hard to control until the tool is removed). Root is `chart.js _syncAdaptivePriceAxisMargin` early-returning when plot height `ch<=0` **without a floor on `margin.r`** → axis width collapses. Tester tickets **TAL-01665/01666/01667**. Single-panel harness shows stable `margin.r=55`; the crush is multichart-specific.

### The proven fix already exists but never shipped to production
`chart v 1.4/chart/multichart/chart-host.html:964-986` carries a **dev-only** post-`drawAxes` clamp `PRICE_AXIS_MIN_R=60`. Production `chart-embed.html` has **no such clamp** (grep-clean). The fix is essentially: port that clamp into the `chart.js` axis-margin contract (enforce min `margin.r`/`margin.b`, guard `ch<=0` after VP redraw), behind its own kill-switch.

### Why it needs the Director
`chart.js` is the **frozen core** on the bless path. Any edit there risks the interaction family we're about to bless. Lane 5 correctly refused to touch it and handed back.

### Decision requested
1. **Pull the `PRICE_AXIS_MIN_R` floor forward now** (small, isolated, already dev-proven), behind switch `__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX`, landing on its own build **after** the combined-build bless (so it doesn't perturb the D-026 proof) — OR
2. **Hold to the post-unfreeze `chart.js` batch** (alongside A6-4 / Option A / Phase 7), reopening the frozen core once, deliberately.

### Manager recommendation
**Do NOT touch `chart.js` before the bless** — the P0 freeze (the urgent part) is already cured freeze-safe, so R2 is no longer emergency-class (workaround: remove the tool). Recommend **option 1 but sequenced immediately post-bless**: land the clamp as the first item of the post-unfreeze `chart.js` batch on its own gated build, so the bless build stays exactly the proven re-migration+transport set. If the Director judges the multichart axis-crush severe enough to warrant a pre-bless core edit, authorize option 1-now with a mandatory D-026 proof-bar re-run on the clamp-inclusive build.

---

## ESC-026 — Multichart orders mark/close at the WRONG panel's price → data-integrity PnL corruption; authorize immediate fix (pull A6-4 forward now that b16 is blessed)

**Filed:** 2026-07-17 (Manager)
**Status:** RESOLVED — **D-030** (2026-07-17): **Option 1 GRANTED with the stopgap rider** — if Lane 3's diagnostic shows the price-source is cleanly isolatable, the narrow gated stopgap lands first (bridge only; A6-4 retires it — no orphaned guard); if not cleanly isolatable, no half-guard on money paths. **A6-4 = #1 post-bless engineering item** (outranks the D-029 clamp where capacity forces a choice; disjoint files, parallel otherwise; one-phase-per-PR on MultichartGrid binds; 6-step design lands step-gated). Proof bar: cross-ticker RED (every mark/close within owning symbol's range) + store-level property test (one order = one symbol feed) + full gate + D-026 proof-row re-run (touches re-migration files). **Ship-gate imposed:** no multichart-order build ships until the owning-panel-price RED is green — binds the stopgap too. PO data-hygiene note: multichart-session PnL records on affected builds are suspect; Manager supplies an out-of-range exit-price filter heuristic.
**Class:** data-integrity defect (wrong money numbers) + scheduling decision (A6-4 was deferred until post-re-migration; re-migration is now BLESSED on `20260717b16`)

### Context / PO evidence (build 20260717b16)
Multichart, two panels, **different tickers/TFs**, one order each. Trades panel (image evidence):
- **#2 GBP/USD** Long: entry `1.64683`, **exit `1.31315`**, size 2.63 → **PnL -587757.04**
- **#1 EUR/USD** Long: entry `1.31321`, exit `1.31316`, size 6.25 → PnL -$31.25

The GBP/USD order's exit `1.31315` is a **EUR/USD-range price**: the order marked/closed against the **peer panel's** price feed → the PnL is corrupted (off by ~7× and negative). PO also reports orders "don't work good on both charts" (panel-B add/interaction intermittent / wrong-panel apply). Both are the **cross-panel order-state bleed** that **A6-4 (host-canonical order store)** was ratified (D-020) to fix, then deferred until post-re-migration.

### Why it needs the Director now
1. **Severity:** this produces *wrong money* on the P&L — worse than a visual glitch. It undermines trust in every multichart order.
2. **The deferral condition is met:** A6-4 was gated "post-re-migration." Re-migration is **done and blessed** (`b16`). The blocker that deferred A6-4 no longer exists.
3. A6-4 edits `MultichartGrid` + `panel-cmd-bridge` (re-migration files) → outside my freeze-safe authority to schedule as top priority without a ruling.

### Decision requested (pick one)
1. **Authorize A6-4 now** as the #1 post-bless engineering item (host-canonical order store: single owner of order state + each order marks against *its owning panel's* symbol/price), own kill-switch, RED-first in multichart topology, full gate + proof-bar. — **Manager recommendation**, OR
2. **Authorize a narrower pre-A6-4 freeze-safe guard** if Lane 3's diagnostic (in flight) finds the price-source bug is isolatable without the full store inversion (own kill-switch, no `MultichartGrid`/`panel-cmd-bridge` edit), landing first as a stopgap while A6-4 follows, OR
3. **Hold** to a later batch (not recommended given money-corruption severity).

### In flight (read-only, no ruling needed)
- Lane 3: `ORD-MULTICHART-CROSS-TICKER-PNL-diagnostic-lane3.md` — pinpoint wrong price source, deterministic GBP+EUR repro, decide whether option 2 (pre-A6-4 guard) is viable, RED spec.
- Lane 2: `S2-COARSE-MAIN-CADENCE-diagnostic-lane2.md` (+ step-forward addendum) — separate replay-cadence family, not blocking this.

### Manager recommendation
**Option 1** — the deferral condition (post-re-migration) is satisfied and the defect is money-corrupting. Green-light A6-4 as the top post-bless item. If Lane 3 finds a clean freeze-safe stopgap (option 2), land that first to stop the bleeding, then complete A6-4. Do not ship any further multichart-order-touching build until at least the stopgap proves the owning-panel-price RED green.

