# Director Decisions — Tickets Overhaul (Plan 2)

---

## D-026 — ESC-023: gated settings-open transport fix AUTHORIZED (scope extends D-024); H-R04/H-R05 record corrected; amplified stress leg added to the proof bar; bless stays blocked

**Date:** 2026-07-16
**Escalation:** ESC-023
**Track:** T3 / RC-4 (re-migration) — panel-B settings-open surface
**RC:** RC-4 (cross-window transport), RC-2-adjacent (open-vs-dismiss ordering)

### Framing

The reconciliation did exactly what the process exists to do: two contradictory results on the same build id were treated as a measurement problem first, the stale-dist hypothesis was killed with evidence, and what remained was a real product defect. Blocking the bless on this was the right call — blessing on a 6/10 surface would have shipped the historical "settings only opens on the second click" pain under a green label.

### Rulings

**1. Honesty correction ACCEPTED into the record.** H-R04/H-R05 are re-marked as **never genuinely green** — an intermittent transport race that a timing-lucky run masked. Note the important distinction for the ledger: this was *not* a false-green (the probe was honest, `hasStyleSection`); it was insufficient sampling against a race. Standing lesson: **a first-pass 10/10 on a surface with known race history earns bless-eligibility only after the D-023 discriminator AND a repeat run** — luck is not reproducibility. The engine rows (H-R02/H-R03/H-R06/H-R07) stand untouched; their switch-OFF discriminators are exactly why they are not in doubt.

**2. Gated Lane 1 transport fix AUTHORIZED — with a mechanism-first fence.** Switch `__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1` (unset = fix ON), touching `openDrawingSettingsForPanel`, `requestMultichartParentDrawingSettings`, and the dismiss window as scoped. One condition on the *shape* of the fix: the worker must first **name the actual dismisser** — trace which peer-clear/focus side-effect kills or preempts the modal inside the budget window — and cure it **causally** (sequence the open after the clear, or make the open request suppress the pending clear). Widening `__v9DrawingSettingsOpenGuardUntil` is authorized only as defense-in-depth **on top of** the causal cure, never as the cure itself. This is the D-024 lesson applied: races get fixed by ordering/ownership, not by tuned timing windows — a wider guard that merely outlasts today's race re-flakes on slower hardware.

**3. Proof bar RATIFIED and strengthened with an amplified stress leg.** Item (C) is measurement gold, not just an artifact to remove: `focusReactPanelSoft` before the dbl-click drives the failure to 0/10, making it the sharpest RED detector for this race. Therefore:
- H-R04 **10/10** and H-R05 **10/10** isolated ON, honest `hasStyleSection`; switch-OFF honest RED (discriminator of record from birth, per D-023).
- **Plus: 10/10 with the `focusReactPanelSoft` amplifier still in place.** If the fix is causal it survives the amplifier; if it only wins the timing race, the amplifier exposes it. Lane 4 may drop the amplifier from the standard gate afterward, but the stress leg runs at bless time and is recorded.
- Then the standard bless: 3× clean `gate:react`, manager gate 0-regressions, on the re-cut build.

**4. Discipline riders (standing rules apply, restated because `MultichartGrid.jsx` is re-migration territory):** full I13 gating — every hunk behind the switch, verified by switch-OFF diff; D-022 mechanical corrective — worker diffs against the manifest and stages by hunk, this fix is its own PR/commit, not bundled with anything else on the bless path.

**5. Bless of `20260716b10` stays BLOCKED; the bless sequence (D-024 ruling 5) is amended:** item (i) becomes "chrome DOM-ready fix + settings-open transport fix green per rulings 2–3." No other items change. A re-cut build follows the fix; baseline promotions keep riding the gate-green commit.

**6. A7 (indicator perf) stays OUT of this build — ratified as recommended.** Clean attribution beats bundling; A7 lands separately after bless per the intake priority note.

**7. Ledger note:** when green, this fix — together with D-024's readiness fix — closes the mechanism behind the "settings opens only on 2nd/double-click" tester family. The Manager cites those registry rows (incl. TAL-01589-adjacent settings rows and the D-024 ruling-4 list) for retest on the combined build rather than as separate defects.

### ADDENDUM RULING (2026-07-17) — pinpoint accepted; 3-hunk implementation AUTHORIZED

The Lane 1 pinpoint (`T3-panelB-settings-transport-pinpoint-report.md`) **satisfies ruling 2's mechanism-first fence**: the dismisser is named end-to-end (duplicate dbl-click double-open zeroes/re-arms the guard → late `multichart-drawing-selected` coincides with an iframe background `deselectAll` → `multichart-drawing-deselected` → `MultichartGrid.jsx:6501` dispatches dismiss **without checking the guard** → fresh Style panel torn down). The guard is not expired — it is cleared mid-open and then not honored. That is an ordering/ownership defect, exactly the class D-026 required be cured causally.

**Authorization — implement the 3 hunks as scoped, under `__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1`, with this classification binding:**
- **Hunk B is the causal cure** (honor the guard + `editingDrawingRef` on the `multichart-drawing-deselected` handler and `onDismissMcSettings`). If any hunk has to be dropped under pressure, B is the one that cannot be.
- **Hunk C (coalesce duplicate opens, ~120ms same source+drawingId)** is legitimate dedupe — same defect shape as H-R03's iframe ctrl-select double-actuation, worth noting in the report as the second instance of the duplicate-actuation family on this surface.
- **Hunk A's ~200ms guard extension is defense-in-depth only** (permitted per ruling 2, but the fix must not depend on it — see stress leg).

**Proof bar unchanged from ruling 3 and restated as binding** (the addendum's ask omitted one leg): H-R04 **and** H-R05 panel-B honest 10/10 ON, switch-OFF honest RED, **plus 10/10 with the `focusReactPanelSoft` amplifier in place** — the amplifier is precisely the tool that distinguishes "B cured the ordering" from "A widened the window enough to pass today." Then the standard bless legs on the re-cut build.

**One non-blocking question for the fix report:** why does the iframe fire `deselectAll({fromCanvasBackground:true})` at all in a dbl-click-on-drawing sequence? If the second click is being misread as background, that is a latent hit-test defect on its own — log it as a registry row (candidate for the duplicate-actuation family) rather than widening this fix's scope.

**Riders unchanged:** ruling 4 (I13 switch-OFF diff on both touched re-migration files; own PR/commit, hunk-staged against manifest) applies as written — `TalariaV8bLive.jsx` + `MultichartGrid.jsx` are shared surfaces.

---

## D-025 — ESC-022: Option B ships now (endorsed); Option A approved as post-unfreeze OPT-IN ("keep orders in view", default OFF) — Option C is the end state

**Date:** 2026-07-16
**Escalation:** ESC-022
**Track:** T4 / RC-5 (order-level visibility) + chart.js core
**RC:** RC-5

### Rulings

**1. Option B — endorsed as dispatched.** Freeze-safe edge marker (`order-manager.js` only, own switch, honest REDs) restores the essential guarantee — the user can always see where their order sits and in which direction — without touching the frozen core. This is the interim answer and it ships on its own merits regardless of A.

**2. Option A — APPROVED, with all three of the Manager's conditions ratified as binding:**
- **Post-unfreeze only.** No `chart.js` autoscale edit lands while the interaction family is on the bless path. It queues behind the combined build, sequenced by the Manager alongside the other post-unfreeze chart.js work (A6-4, Phase 7) so the frozen core reopens once, deliberately, not piecemeal.
- **Opt-in, default OFF.** Axis-pull is a genuine preference split — a far pending order compressing the candles is a feature to some traders and a nuisance to others. Default autoscale behavior is unchanged; the "keep orders in view" toggle enables domain-inclusion per user. Behind its own kill-switch (separate from B's switch — the marker and the domain-inclusion must revert independently).
- **Scope precision for the implementer:** domain inclusion applies to **active order/pending entry levels only** (not SL/TP legs by default — including those would triple the pull effect; if the PO wants SL/TP included, that's a toggle refinement later). The inclusion must be **bounded**: a level beyond a sane multiple of the visible price range does not stretch the axis to absurdity — it falls back to B's edge marker. (Unbounded inclusion + a fat-finger pending order at 10× price = unreadable chart; the bound keeps C honest.)

**3. UX contract when both land (Option C):** toggle OFF → default autoscale + B's edge markers (always-visible direction cue); toggle ON → bounded domain inclusion keeps order levels on-plot, edge marker covers anything beyond the bound. PO staging A/B of both postures is the acceptance for A.

**4. Ledger:** the diagnostic's finding that no edge indication existed at all closes the actual PO complaint via B; A is a UX enhancement, not the bug fix — registry row cites B as the fixing change.

---

## D-024 — ESC-021: chrome-readiness race fix AUTHORIZED (P3 verify-only → fix-scope per the D-021 contingency); ready-signal becomes the harness wait primitive

**Date:** 2026-07-16
**Escalation:** ESC-021 (the D-021 fresh-escalation contingency, correctly fired)
**Track:** T3 / RC-1+RC-4 (re-migration) — P3 settings + Esc leg
**RC:** RC-2-adjacent (readiness/commit ordering) within RC-4

### Framing
This is the verify-only contingency working as designed: a verify row failed for real, nobody patched it silently, the evidence came back (1/10 and 7/10 under per-run browser isolation — unambiguously a race, not suite noise), and a read-only diagnostic named the mechanism before any code was proposed. Worker 4's refusal to mask with sleeps is exactly the I15 posture. Authorization granted.

### Rulings

**1. P3 (+ the Esc verify leg) converts from verify-only to fix-scope** for this one root: the parent chrome advertises gear/settings readiness **before the DOM is committed and handlers are bound**, so real user events landing in that window no-op. One small gated Lane 1 fix as recommended: emit the ready signal **after DOM commit** (`TalariaV8bLive.jsx`) + gate the manager selection handler, behind **`__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4`** (unset = fix ON). Scope fence: readiness ordering only — no changes to the settings-open transport itself (that mechanism is proven; the signal timing is the defect).

**2. Acceptance (per D-023's discriminator rule, applied from birth):** H-R04 and H-R05 **10/10 PASS isolated**, switch-OFF **10/10 FAIL** — the switch is the named discriminator of record for both rows from day one. Then Lane 4 re-runs the STEP-1 isolation matrix and requires **3 consecutive clean `gate:react`** runs before bless. No sleeps, no retries.

**3. The ready-signal becomes the harness wait primitive — ratified as part of this fix.** Lane 4 replaces timeout-based waits with awaiting the real "chrome ready" signal wherever the harness interacts with panel chrome. This is the honest-measurement dividend: the product emits a truthful readiness event and the harness consumes it — races become deterministic assertions instead of tuned timeouts. (It also means any future readiness regression fails loudly in the harness rather than flaking.)

**4. Real-user impact note for the ledger:** this race is almost certainly the mechanism behind the historical "settings open only on double-click / second try" family of tester reports (the first click landed in the unready window). When the fix is green, the Manager cites those registry rows for retest on the combined build rather than treating them as separate defects.

**5. Bless sequence (consolidated, now four items):** (i) this fix green per ruling 2, (ii) H-R02 discriminator (D-023), (iii) H-S27/H-S83 triage (already dispatched), (iv) assembly gate green → PO parity checklist on the blessed combined build. Baseline promotions continue to ride the gate-green commit.

---

## D-023 — ESC-020: dedupe A/B accepted as H-R03's discriminator; H-R02 needs its own discriminator BEFORE bless; P1 stays as gated defense-in-depth

**Date:** 2026-07-16
**Escalation:** ESC-020
**Track:** T3 / RC-1+RC-4 (re-migration) + T0 (harness honesty)
**RC:** RC-1 / RC-4 / RC-7

### Framing
The Manager was right to bring this rather than self-approve — swapping a Director-mandated honesty gate is exactly the class of decision that must not happen silently. The situation itself is benign: `ecaa8a9c` is a more complete selection mechanism, so the old discriminator's power moved, it didn't vanish. The job now is to re-anchor the honesty proof to where the load actually is.

### Rulings

**1. Dedupe A/B ACCEPTED as the discriminator of record for H-R03.** `--iframe-ctrl-dedupe-off` → 10/10 FAIL-REAL-BUG is a genuine one-knob discriminator, stronger than the Phase-1 leg it replaces (it isolates the exact mechanism that fixed the row). Criterion 4 is satisfied for H-R03 via criterion 1. The D-021 standing condition is updated, not retired: **every trusted row must have a named discriminator that provably flips it red; when a mechanism change moves the load, the discriminator moves with it via escalation — never silently.** (This case is now the worked example.)

**2. H-R02 requires its own re-derived discriminator BEFORE bless — Manager's option (a) with the hard half of the question answered.** The trust in the 8 flipped-green rows (D-021) was anchored on the Phase-1 A/B; that anchor is now retired for H-R02, which currently has **no** proof the harness can detect its failure mode. An undiscriminated green row on the bless-critical path is exactly what I15 forbids us to trust. Lane 4 re-derives a small H-R02 discriminator (e.g. a switch-off or targeted stub that provably breaks single-select store commit → H-R02 10/10 FAIL) before `20260716b10`-or-successor is blessed. This is the only new work this ruling adds, and the Manager already sized it as small.

**3. P1 stays committed + gated as defense-in-depth — with an honest ledger note.** Manager's read (a) is accepted: the engine substrate still owns non-ctrl selection routing the harness rows don't isolate. But the ledger records plainly that **P1's harness-visible load-bearing role for H-R02/H-R03 is now unproven**. If a future cleanup proposes retiring P1 as dead code, that is a fresh escalation with evidence (a discriminator that flips something when P1 goes off) — not a housekeeping commit.

**4. Bless sequence restated:** bless of the combined build waits on (i) this ruling's H-R02 discriminator, (ii) the criterion-5 triage (H-S27/H-S83 — separate, already dispatched), (iii) assembly gate green with the r1 host-only H-R03 flake watched (one more 10/10 run on the bless candidate; if the host flake recurs, it gets a row per the D-022 watch-item rule). Baseline promotions continue to ride the gate-green commit (D-022 directive 3).

### Watch item
The r1 host-only H-R03 flake: one recurrence on the bless candidate = its own tracked row, not a flake label.

---

## D-022 — ESC-019 acknowledged (no blocking ruling); three Director directives on the discipline breaches

**Date:** 2026-07-16
**Escalation:** ESC-019 (informational — H-R03 regression on combined b6; ungated path; mixed P4+P5 commit)
**Track:** T3 / RC-1+RC-4 (re-migration)

### Acknowledgment
Manager's handling endorsed in full: stop-on-bless, holding the baseline promotions, read-only diagnostic first. The unfreeze slipping one fix+re-gate cycle is the process working, not failing — b6 was caught by the assembly gate, not by testers. No ruling blocks the fix; the pre-authorization stands as filed (Manager drives to green unless the fix needs scope/architecture change).

### Directives (recorded so they bind the fix and the aftermath)

**1. The I13 gap is part of the fix's exit criteria, not a separate cleanup.** Whatever the diagnostic finds, the fix is not accepted until: (a) H-R03 is 10/10 on the combined build, AND (b) **every path the offending change touched is behind a switch whose OFF state provably restores pre-change behavior** (switch-off A/B recorded in the report). "Row green but path still ungated" is a bounce. If the ungated path turns out to be pre-existing (not introduced by P4/P5), report that honestly — it then becomes a registry row rather than retroactive blame, but the new code riding it still gets gated.

**2. Mixed-commit corrective — mechanical, not aspirational.** The one-phase-per-PR rule was breached by two phases' hunks sharing a working tree at commit time. Corrective rule (binding, all lanes): **before any commit on a shared-surface file (`MultichartGrid.jsx`, `panel-cmd-bridge.js`, `drawing-tools-manager.js`), the committing worker runs `git diff --stat` against the phase's declared file manifest and stages by hunk if anything out-of-manifest is present; any out-of-manifest hunk in the diff = STOP and report to the Manager.** The Manager includes the manifest check in every land-prompt for shared surfaces. If P4 and P5 cannot be retro-split (history already shared), do not rewrite history — record `f46e6d9d` as a known mixed commit and rely on the (now-mandatory) switch coverage for independent revert.

**3. Assembly-gate promotion order.** Lane 4's hold is correct and becomes the standing pattern: **no baseline promotion (known-failing removals, H-S34/35/44 etc.) lands until the assembly gate is green on the combined build** — promotions ride the gate-green commit, never precede it. This prevents a broken combined build from inheriting an optimistic baseline.

### Watch item
H-R04/H-R05 panel-B "secondary flakes behind the H-R03 block" — after the H-R03 fix, both must show 10/10 before they're called flakes; if either stays unstable, it gets its own row, not a flake label (I15).

---

## D-021 — ESC-018: revalidated 2-row matrix trusted; Phases 2/3/6 → verify-only, P4 reduced to Delete, P5 stands; Phase-1 commit fires now; unfreeze gate re-derived

**Date:** 2026-07-16
**Escalation:** ESC-018
**Track:** T3 / RC-1 + RC-4 (re-migration)
**RC:** RC-1 / RC-4

### Framing
This is D-018's standing condition doing exactly what it was written for — "if rows are genuinely green on fallback, affected phases shrink; we don't re-fix working rows" — at a larger magnitude than anyone expected (8 of 11). The honesty question is the only question, and the Phase-1 A/B answers it: a harness that flips 10/10 FAIL-REAL-BUG on H-R03 the moment the engine substrate is switched off is not a blanket-green harness — it discriminates. That is the I15 standard: the assertion detects absence of the mechanism, not just presence of a pass.

### Rulings

**1. The revalidated 2-row matrix is TRUSTED as the authoritative honest baseline.** The 8 flips (H-R01/02/03/04/05/08/13/14) are accepted as click-miss artifacts of the pre-fix actuation, not new false-greens. Two conditions attached:
- **Lane 4 freezes the hit-coord-fixed harness** as the reference version (SHA recorded in the findings log); any future actuation change re-runs the Phase-1 A/B discriminator before its results are trusted — the A/B is now the harness's own regression test.
- The ledger records the honest history plainly: the original "12 honest RED" baseline was itself partially an artifact. This is the second time measurement error inflated apparent breakage (opposite sign from ESC-011). Standing lesson for the registry: **HR-PARITY#1–#8 rows that correspond to flipped-green surfaces close as measurement-artifact, not as fixed** — testers' live experience never disagreed with these 8 rows, and misclassifying them as fixes would corrupt the fix-rate statistics.

**2. Re-scope APPROVED as requested:**
- **P2, P3, P6 → verify-only**: each runs its rows 10/10 on the combined build and confirms no regression; **no new engine fix, no new switches**. Their planned mechanisms (routing V3 re-enable, settings transport, marquee) are NOT dispatched — if a verify-only pass fails on the combined build, that phase reverts to fix-scope via a fresh escalation with the failure evidence.
- **P4 reduces to the H-R06 Delete leg** (still the new `PANEL_KEYBOARD_V1` switch per D-018; the Esc half becomes a verify-only row since H-R05 is green). The Phase-4 `panel-cmd-bridge.js` collision window with T8 still applies, but it just got much shorter.
- **P5 stands for H-R07** (cross-panel select store empty) + its H-S34/35/44 promotion duties.
- Owners: Manager assigns H-R06 and H-R07 to Lane 1/Lane 2 per queue; they may run in parallel if their file sets stay disjoint (Delete = keyboard/bridge path; peer isolation = MultichartGrid/manager path) — the one-phase-per-PR rule on `MultichartGrid.jsx` still binds.

**3. Phase-1 commit FIRES NOW — confirmed.** It discharges a proven honest RED (H-R03 fails 10/10 without it), is kill-switched with the D-018-mandated master slice switch, and is file-scoped. It does not need to wait on anything in this ruling.

**4. Unfreeze gate re-derived — confirmed, with the criteria list restated so nothing silently drops:**
1. P1 + P4-Delete (H-R06) + P5 (H-R07) green 10/10 on the honest harness, switch-OFF REDs proven.
2. P2/P3/P6 verify-only rows pass on the combined build (they are still gate rows — verify-only ≠ skipped).
3. The full 12-row matrix green on the **combined build** (not just the phase builds), build-id asserted inside panel B.
4. Accumulated staging work folded in (cadence b1, order-entry incl. A6-1 if landed, settings/Esc/Delete, TF-label, refresh-persistence) with smoke rows for previously PO-confirmed items.
5. H-S34/35/44 promoted; no open HR-PARITY registry rows (the 8 artifact rows close per ruling 1).
6. **PO parity-checklist sign-off on that exact combined build** — unchanged, still the final gate.

### Net effect
The engine work remaining before unfreeze is two rows: **Delete-in-panel and cross-panel selection isolation.** Everything else is verification. This is the closest the freeze-lift has ever been; the Manager should sequence H-R06/H-R07 as the top items on their lanes and begin assembling the combined build manifest in parallel.

---

## D-020 — ESC-017: apply-on-release invariant approved; A6-4 host-canonical order store ratified in principle (dispatch post-re-migration); landing sequence approved

**Date:** 2026-07-16
**Escalation:** ESC-017
**Track:** T4 / RC-5 (intake amendment A6)
**RC:** RC-5

### Rulings

**1. A6-1 apply-on-release — APPROVED as the canonical SL/TP interaction invariant.**
- The invariant, stated for the contract: **while the pointer is down, a dragged SL/TP line is provisional** — it renders at the cursor, but the store value does not change and no fill/close/hit logic may evaluate against it; **commit happens once, on release**. Replay ticks during the drag hit-test against the *last committed* value, not the provisional one.
- Two edge cells the fix must specify in its state matrix (so we don't meet them as regressions):
  (a) **Committed-value crossing during drag:** if price crosses the *last committed* SL while the user is dragging, the close **does** fire — apply-on-release protects the provisional line, it does not suspend risk semantics on the committed order. If the PO wants drags to freeze hit-testing entirely, that is a separate spec question; default is committed-value semantics.
  (b) **Drag cancel (Esc / pointer leaves window / replay stopped mid-drag):** provisional discards, line returns to the committed value — no partial commit.
- Freeze-safe as stated (`order-manager.js` only), switch `__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX`, RED-first repro = TAL-01602's exact scenario (replay playing, drag SL across price, hold — no close; release beyond price — normal behavior).

**2. A6-4 host-canonical order store — RATIFIED as the target architecture; dispatch GATED behind the re-migration.**
- The architecture is correct and is the RC-5 sibling of every ownership lesson this project has learned: one canonical owner (host `orderManager`), panels render projections, edits route to host and fan out (I14 postMessage transport). Per-panel mutable clones with partial sync is the exact defect class we're eliminating everywhere else.
- Dispatch after the re-migration combined build ships (it edits `MultichartGrid.jsx` + `panel-cmd-bridge.js` — both re-migration surfaces; landing it mid-phase would break the one-phase-per-PR serialization). It slots naturally as a **post-unfreeze tranche alongside Phase 7** — Manager schedules the two so they don't collide on `panel-cmd-bridge.js`.
- Design note binding on the eventual fix: the missing `order:opened-updated` fan-out is a symptom, not the fix — do NOT patch a second sync event onto the clone model. The fix is the ownership inversion.

**3. Landing sequence — APPROVED:** A6-1 now (freeze-safe, Lane 3 executes immediately); A6-2 persistence next/parallel (spec settled by D-019: pending + open, per session); A6-3 (price-axis order isolation) + A6-4 post-unfreeze. Note A6-3's spec context: D-019 cancelled the *axis-side* Defect D (price-label drag behavior stays as-is) — A6-3 is only the *order-side* isolation (axis gesture must not move order lines, TAL-01615); its RED must assert order-line invariance, not axis behavior.

**4. TAL-00752 #4/#5 (replay×drag / keyboard-pan) — YES, land coherently with A6-1** as one `order-manager.js` region series: same worker, same region, sequential gated commits (A6-1 first, then #4/#5 per T8 step-15's consolidation note), each behind its own switch. One region owner avoids a three-way merge in the drag-handler code. T8's step-15 landing-order recommendation (H-S25 seam → #4/#5 → H-S30 promote) is folded around this: #4/#5 ride the Lane-3 series since they're `order-manager.js`, not bridge files.

### Acceptance
A6-1: RED→GREEN on the TAL-01602 repro + property tests (drag sequences: committed value invariant under move; single commit on release; cancel discards) + switch A/B + full gate + **PO staging confirm** (drag SL across price during play — held = no close; release = commits). A6-2 acceptance per D-019's spec (pending + open survive F5, per session).

---

## D-019 — PO spec answers (P6): price-label drag stays as-is; order persistence = pending + open

**Date:** 2026-07-16
**Origin:** PO direct answers to the two standing spec questions.

1. **Price-label drag (T2/A1 Defect D):** PO — "leave it like it was, don't touch, it still works." **Defect D fix is CANCELLED.** The A1 axis family is A/B/C only; registry row for TAL-01566 closes as working-as-intended per PO. No lane dispatches Defect D.
2. **Order persistence across refresh (A6 / TAL-01616):** PO confirms **both pending orders AND open positions** persist across F5, scoped to the session (recommendation accepted). This is the binding spec for the A6 persistence row; Lane 3 may implement without further clarification.

---

## D-018 — ESC-016: multichart interaction re-migration AUTHORIZED — Phases 1–6 under the plan's fence; unfreeze criteria ratified

**Date:** 2026-07-15
**Escalation:** ESC-016 (reference: `T3-REMIGRATION-PLAN.md`)
**Track:** T3 ∩ T1 (RC-1/RC-4), Phase 7 = parked T5/RC-3
**RC:** RC-1 / RC-4

### Framing
This is the crossroads the whole freeze has been waiting for, and the prerequisite chain is genuinely satisfied: D-011 asked for root confirmation, D-012 demanded honest measurement, and Lane 4 delivered it — 12 stable honest-RED rows on real actuation is the first trustworthy picture of multichart interaction we have ever had. The plan is the opposite of the b44/b88 pattern: it re-migrates one root group at a time against a harness that can no longer lie. **Authorization GRANTED for Phases 1–6 as written**, with the rulings below.

### Rulings

**1. Execution authorized — phased, not wholesale.** The 6-phase order (engine substrate → chrome routing → settings transport → keyboard bridge → peer isolation → marquee), one root group per phase, honest RED→GREEN + D-011 step-0 A/B before the next phase starts. No phase may begin while the previous phase's switch-OFF RED restoration is unproven.

**2. Phase 0 is a hard gate, including the baseline discrepancy.** The plan targets the 12-row step-17 matrix while `known-failing.json` currently tracks 10 (H-R07/H-R12 promoted in a later reconcile). Lane 4 re-runs the full matrix on the current build **before Phase 1 dispatches** and freezes the authoritative row set; if H-R07/H-R12 are genuinely green on fallback-B, the plan's row→phase map is updated and Phases 2/5 shrink accordingly — we do not re-fix green rows.

**3. Kill-switch rulings:**
- Phase 4: the **new** `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` — do NOT extend the quickbar-settings switch. One mechanism, one switch; extending an existing switch entangles two revert paths (I13 in spirit).
- The Phase-1 master slice switch (`__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE`) is **required, not optional** — every phase must have a one-knob revert even where it wraps multiple existing predicates. Same pattern for any phase whose slice spans >1 legacy switch.

**4. T8 collision — scheduling rule.** The Manager owns the Phase-4 window: T8 pauses `panel-cmd-bridge.js` edits only for that window (Phase 4 touches discrete keyboard cmd cases only), then resumes. T8's replay/cadence work otherwise continues in parallel per D-013/D-016 — this authorization does not preempt it. `sync-bridge.js` (Phase 7) stays untouched until after unfreeze, as planned.

**5. Unfreeze criteria RATIFIED as written** (12/12 honest GREEN + gate:react PASS + switch-OFF REDs proven + H-S34/35/44 promoted + PO parity-checklist sign-off on the same deployed build with build-id confirmed inside each panel + no open HR-PARITY rows). One addition: **the unfreeze deploy is a single combined build** carrying the accumulated staging work (cadence, order-entry, settings/Esc/Delete, TF-label). The PO's parity-checklist pass happens on that combined build — not on a re-migration-only build that later gets the staging items appended without re-verification. Anything staging-confirmed earlier gets a quick smoke row on the combined build, not a full re-test.

**6. Labeling discipline stands:** every phase report is **DONE (dev only) — NEEDS-LIVE** until the PO's checklist pass; "proven" appears only after unfreeze criteria are met. GREEN-SYNTHETIC has no role in this plan — reactParity rows are honest-actuation only (I15).

**7. Phase 7 (RC-3 anchoring parity) — approved in principle, dispatch gated on a post-unfreeze go-signal from me.** It rides a different file surface and a calmer moment; it does not ride this authorization automatically.

---

## D-017 — ESC-015: pan-release anchor policy approved — the user's released viewport is authoritative; compensation re-based, not removed

**Date:** 2026-07-15
**Escalation:** ESC-015
**Track:** T8 (Lane 2)
**RC:** RC-8 / RC-3 (anchor)

### Rulings

**1. Policy APPROVED, with one precision.** When `userHasPanned`, no post-release index-pin or prepend compensation may move the panel toward grab-point or host anchors — the released viewport wins until the user re-engages sync. Precision on mechanism (b): prepend compensation is **re-based, not removed**. Its legitimate job — keeping the same bars on screen when a prepend shifts indices — remains; the defect is that it compensates from a **pre-drag snapshot**, which undoes the drag. The fix: compensation baseline = the released (post-drag) viewport. Deleting compensation outright would trade snap-back for prepend-jump.

**2. Scope: host + all panels.** The mechanism and the user intent are identical everywhere; a host-only or panel-only split would leave the same complaint on the other surface. State matrix must cover: paused vs playing (the playing×drag cell interacts with BL-12's drag-disengage — must not conflict; different mechanism, same gesture), sync on/off, and the D-015 edge-park path (no interaction expected — advance happens on play frames, not release — but the matrix proves it).

**3. Standalone gated fix CONFIRMED** (not folded into T5 anchor-unification, not into policy-v2 migration). Switch: `__TALARIA_MC_DISABLE_PAN_RELEASE_ANCHOR_HOLD` (family naming; OFF = fix ON). RED-first via **H-S82** (Lane 4 confirms the id; spec as the manager wrote it — settled `offsetX` ≈ release offset, not grab offset). Acceptance: H-S82 RED→GREEN + switch A/B + H-S73/BL-12/D-015 families green + PO staging confirm.

**4. H-S73's FAIL-REAL-BUG is a separate defect — registered, not folded.** It pins B-FIX-C prepend compensation (host backward-load shifting peer offsetX) and is failing on a real bug today. Registry row now; its diagnostic queues in Lane 2 behind the TAL-01579 fix; the coverage/policy-table mapping correction is accepted.

---

## D-016 — ESC-014: finest-TF replay cadence approved (PO spec, unified clock); design-doc-first; speed semantics anchored to the selected panel

**Date:** 2026-07-15
**Escalation:** ESC-014 (the D-015 parked cadence item, correctly reopened after the freeze fix was PO-confirmed on a4)
**Track:** T8 (Lane 2)
**RC:** RC-8

### The four forks, ruled

**1. Clock granularity — UNIFIED FINEST-TF CLOCK (the PO's spec), not the decoupled option.**
The manager's decoupled recommendation (host keeps its step, finer panels sub-advance) does not deliver the PO's stated requirement — "coarser panels form their candle over the finer ticks" is only possible if the shared clock ticks at `min(TF)` across panels. The 240×-blowup concern conflates **clock ticks with renders**: under the BL-13 pixel-column coalesce rule (ratified D-040/D-041), a 4h panel's playhead moves sub-pixel on almost every 1m tick, so its extra renders coalesce to pixel-column crossings — the forming-candle update on coarse panels must go through the same coalesce path (this is a hard design requirement, not an optimization to add later). The machinery exists: multichart hosts already hydrate a 1m master (plan-1 design), tick-animation/`animatedCandle` already renders forming bars, and D-015's own-master advance keys panels off shared timestamps.

**Speed semantics (the fork inside the fork, ruled now so the design doesn't guess):** the speed control keeps its current *perceived* meaning — market-time per wall-second anchored to the **selected panel's TF**, exactly as today. Finer ticks subdivide within that pace; they do not slow it. Concretely: host 4h at speed "1 candle/sec" still forms one 4h candle per second; the 1m panel advances its 240 candles within that same second (coalesced renders). Wall-clock parity across panels is the invariant — all panels always show the same market timestamp.

**2. Master re-derivation — LIVE, edge-triggered.** `min(TF)` recomputes when a panel is added, closed, or switches TF, on the transition edge only (no per-frame polling — I10/plan-1 lesson). A recompute mid-play must not seek or shift any panel's viewport; it only changes the tick subdivision going forward.

**3. Independent-symbol panels — INCLUDED.** The clock is shared market timestamps; a 1m panel on another symbol still needs 1m ticks to advance smoothly. `min(TF)` spans all present panels regardless of symbol. (Each panel still advances on its own master per D-015 — the clock carries no data.)

**4. Edge-park interaction — CONFIRMED as the manager stated.** D-015's own-master advance is untouched; this changes only the cadence of the shared clock the panels key off. If a finer clock exposes a new park case (240× more chances to hit a missing-data edge), that is D-015's fallback path doing its job — bounded catch-up, never a park while data exists.

### Process rulings

- **Design-doc-first APPROVED** (Lane 2), covering: tick-source change in the host replay loop, the coalesce path for coarse forming candles, speed-semantics implementation per above, re-derivation edges, and a **measured cost column** — frame-time/render counts on a 4-panel 1m/4h mixed layout at max speed, before/after. If the measured cost breaks the frame budget, escalate back with the numbers — do not silently degrade to decoupled.
- **Kill-switch:** `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` (naming parity with the family; switch-off must render today's selected-panel cadence exactly). Staging default: fix ON, and the PO A/Bs both postures in the same session.
- **Acceptance:** harness evidence labeled honestly per I15 (cadence assertions are timestamp/counter-based and can be genuine; feel is not) + **PO staging confirm is the deciding authority** — this is a feel feature; the PO A/B is the test. TAL-01563's documented-intentional ruling (D-014) is superseded by this design once accepted; its registry row rides this work.
- **Sequencing:** behind nothing — Lane 2's next design item after the H-S60–78 promotion continues; migration of ratified cells proceeds in parallel. Deploy freeze unaffected; staging only.

---

## D-015 — ESC-013: own-master play-advance extended to all PLAY cells; unified switch approved; D-014 ratification amended for the play column

**Date:** 2026-07-15
**Escalation:** ESC-013
**Track:** T8 (Lane 2), per D-013/D-014
**RC:** RC-8

### Framing
The escalation path worked exactly as designed: D-014 ratified the same-symbol play cells as "current = correct," PO evidence showed they are not, and the Manager escalated instead of silently migrating. **D-014 ruling 1 is formally amended:** the same-symbol×playing cells (same-TF, coarser, finer self-owner) move from "ratified" to "approved-changed" — the policy table is updated so the migration later implements the corrected cells, not the parked ones. The diagnostic's mechanism identification is convincing: "stuck until TF change, then resumes" is the catch-up state clearing on the TF-switch refetch — same edge-park, one mechanism, three entry points.

### Rulings

**1. Extension AUTHORIZED — one root fix across the PLAY cells, not per-cell patches.**
- Same-TF×playing and coarser×playing: during PLAY, advance on the panel's own master (`scheduleCoalescedSeek(ch, ts, true)` semantics), skipping the mirror-first fetch that causes the park; async mirror/catch-up remains the fallback for genuinely missing data, breaker retained for that fallback only.
- Finer self-owner×playing: same own-master principle through its existing self-own path; the fetch race is bounded by the same rule — never park at the edge while playing when the own master can advance.
- Hard constraint: this must not reintroduce the BL-5 reslice storm or disturb BL-10/11/12/13 — those scenarios plus H-S17/H-S19 family stay green as the regression fence.

**2. Unified switch APPROVED:** `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE` covering independent + same-symbol cells (one mechanism → one switch, per I12's spirit and the Plan-1 lesson that BL-11/12/13 were one feature). Migration note: `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` from step 3 is **superseded and folded in** — the report must show the old switch either aliased to or retired into the new one, with the H-S59b A/B re-run against the unified switch. No period where two switches independently gate overlapping behavior.

**3. Finest-TF-master idea — CONFIRMED SECONDARY.** The diagnostic is right that it addresses jump/group-advance *feel*, not the edge-park freeze. Parked as a separate cadence-policy cell proposal, to be evaluated **after** the freeze extension lands and the PO retests — same reasoning as D-014's TAL-01563 ruling: much of the felt chunkiness may be the park itself. If the PO still wants smoother cadence after the freeze is gone, it comes back as its own design escalation with a cost column.

**4. Coarse-panel full re-render + viewport-move-back — CONFIRMED RC-2/T2 cross-cut**, routed out of T8 (rides the TAL-01573 routing). Registry row cites both symptoms; T2 picks it up with its invalidation-contract discipline. The policy table keeps a pointer.

**5. Acceptance (per Manager's recommendation, ratified):** PO-staging-confirm-led — the local harness cannot force the breaker (H-S59b WEAK verdict honestly labeled, consistent with I15). The same-TF/coarser H-S59b variant lands as **GREEN-SYNTHETIC dev evidence**, explicitly labeled. The PO note from the diagnostic (record the stuck panel's TF vs host TF when a freeze hits) is the disambiguating live evidence — PO please capture that on the staging retest. Deploy freeze unaffected; staging only.

---

## D-014 — ESC-012: T8 policy table APPROVED as acceptance spec; independent×playing cell fix authorized as the priority item

**Date:** 2026-07-15
**Escalation:** ESC-012
**Track:** T8 (Lane 2), per D-013
**RC:** RC-8

### Rulings

**1. Policy table APPROVED as the T8 acceptance spec** (`T8-MIRROR-POLICY-TABLE.md`), with one carve-out: the three cells flagged in §4 "needing Director approval" (independent×playing; coarse×playing×sync-ON guard disagreement; BL-16 cause split) are **excluded from silent migration** — they migrate only after their individual resolutions below. Everything else in the table is ratified as the "current behavior = correct behavior" contract; step-3 migration behind `__TALARIA_DISABLE_MIRROR_POLICY_V2` is unblocked for those cells, guard-by-guard, gate re-run per migration, per the plan.

**2. Independent×playing cell change AUTHORIZED — this is the T8 priority item (TAL-01590, P1).**
- Approved policy for the cell: **advance on the panel's own master during play** (adopt-data Y from own master + adopt-X Y on own bars, keyed to the shared playhead timestamp), mirroring BL-10's coarser-panel mechanism — with the async catch-up/breaker retained as the fallback for genuinely missing data, not as the primary advance path.
- Gated `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` (default = fix ON), **RED-first via H-S59b** — the fix may NOT accept against the current H-S59, which the manager correctly flagged as not reproducing the freeze.
- This fix may land **ahead of and independently of** the policy-v2 migration (it's a P1 with its own switch); the migration later absorbs it as the cell's implementation.
- Acceptance: H-S59b RED→GREEN + kill-switch A/B + BL-10/11/12/13 family staying green + **PO live-confirm on a staging build** (D-012 posture; deploy freeze unaffected).
- I11 note for the record: this is a **sanctioned policy-cell change under T8 ownership**, not a new guard on the mirror-frame tail — it is exactly what T8 exists to do.

**3. The other escalation-candidate cells:**
- **BL-16 / TAL-01578 (playing×drag×adopt-X):** diagnostic-first CONFIRMED (consistent with the earlier BL-16 read). H-S78 pins the contract; no fix dispatch until the (a) X-follow-re-engage vs (b) Y-autoscale-refit split is measured.
- **TAL-01579 (release snap-back, prepend-compensation conflict):** ESCALATION-CLASS confirmed — do NOT fold into the migration. H-S73 pins current behavior first; then a separate diagnostic proposes the prepend-compensation policy for that cell with the ticket as evidence. It waits behind the independent-play fix in Lane 2's queue.
- **TAL-01573 (manual rescale full re-render):** RE-ROUTED to RC-2/T2 as a cross-cut — correctly identified as not mirror-policy. Registry row moves to T2's scope; the policy table keeps a pointer, not a task.
- **TAL-01563 (group-advance cadence on coarse panels):** ruled **documented-intentional** — coarse panels advance when a candle forms; BL-13's continuous sub-candle follow already smoothed the viewport. Record as the cell's documented behavior; reopen only if the PO flags it again *after* the independent-play fix lands (much of the reported "chunkiness" may actually be TAL-01590's freeze-stutter, so retest it then).

**4. Harness ownership (distinct-symbol replay actuation) — manager's recommendation ADOPTED:** Lane 2 extends `serve.mjs` + host scenarios for H-S59b (≥2 distinct symbols, production-faithful play actuation: `replayPlay` + tick-animation frames, no synthetic seek in the inner loop) — this is the host harness, not `react-parity-lib.mjs`, so Lane 4's D-012 exclusivity is respected. Lane 4 reviews the actuation approach before H-S59b is trusted (one written sign-off in MANAGER-FINDINGS, not a hand-off) — I15 applies: assert per-panel end-state (`replayTimestamp` advancing, forming bar advancing, no panel frozen while peers move), no proxies.

**5. Sequencing inside Lane 2:** (i) H-S59b RED, (ii) independent-play fix → staging → PO confirm, (iii) H-S60–H-S78 coverage promotion continues in parallel, (iv) guard-by-guard migration of ratified cells, (v) TAL-01579 diagnostic. TAL-01564 and T3 rows 13–16 remain behind these per D-013.

---

## D-013 — PO priority directive: T8 (synced-multichart replay experience) pulled forward; starts now on Lane 2

**Date:** 2026-07-14
**Origin:** PO directive (not an escalation) — "visually and from UX, the T8-related issues are the most annoying: playing and replaying the synced multicharts. Make it a priority and close it early with high quality so the testers can test properly."
**Track:** T8 (Lane 2)
**RC:** RC-8

### Why the re-sequencing is safe now
T8 was gated behind T3 (same bridge files) and a "quiet period." D-012 froze the multichart **interaction** family pending Lane 4's honest-harness rebuild — which idles exactly the Lane 2 work that was ahead of T8, while T8 itself lives on the **data/X/Y replay policy path**, a different subsystem untouched by the freeze. The quiet period the plan asked for has effectively arrived, just not the way we expected. The strongest live evidence this week (TAL-01590 replay freeze; the 8 intake evidence rows) is all T8-family.

### Rulings

**1. T8 starts NOW on Lane 2, in the plan's own safety order — no phase is skipped:**
- **Step 1 (immediately, non-invasive): coverage hardening.** RED scenarios for the ~17 kill-switches without dedicated coverage + BL-16 (T8 §3 debt item, already specced "do this first"). This hardens the acceptance contract before any refactor and produces zero product risk. File check: this edits `harness/scenarios.mjs` etc., NOT `react-parity-lib.mjs` (Lane 4's exclusive file under D-012) — no collision.
- **Step 2 (parallel, read-only): policy-table design doc** (T8 §1). Full matrix (TF relation × replay state × sync per axis), each existing guard's decision extracted into its cell; conflicts/gaps escalate. **The A5 diagnostic (TAL-01590, independent-symbol replay freeze) is folded in as the design's first mandatory input** — the independent-symbol × playing column must be specified from its trace, since that's where the live freeze is. The 2026-07-13 intake evidence rows (TAL-01560/62/63/73/75/77/78/79) map to cells per the existing plan text.
- **Step 3 (after Director approves the table): guard-by-guard migration** behind `__TALARIA_DISABLE_MIRROR_POLICY_V2`, full gate re-run per migration, superseded guards retired only after their scenarios pass through the policy path. Unchanged from the plan.

**2. Priority order inside Lane 2:** T8 steps 1–2 + A5 diagnostic **ahead of** TAL-01564 and the T3 layout-state rows 13–16 (those rows still need my owner approval and are less painful than replay). The frozen T3 interaction rows stay frozen per D-012 regardless.

**3. Quality bar (the PO asked for early AND high quality — these are the non-negotiables):**
- Zero-behavior-change constraint stands: any cell whose policy value differs from shipped behavior is an **escalation with its ticket as evidence**, never a silent correction. TAL-01590's freeze cell will be exactly such an escalation — that is the designed path for it.
- The plan-1 29-scenario gate + the new coverage scenarios are the acceptance contract; gate green after every migration.
- PO live-confirm on the synced-replay feel (play, pause, scrub, TF mix, different symbols) is part of T8's exit — matching the D-012 posture that live confirmation is the trusted authority.
- Deploy freeze note: T8 builds ship to **staging** for PO confirm while the D-012 freeze holds; the freeze is about the interaction family, and lifting it is a separate decision.

**4. What this does NOT change:** Lane 4 stays on the honest-harness rebuild (D-012 critical path). Lane 1 stays on the settings-transport diagnostic. Lane 3 stays on the A3 replay fixes (D-009) — which are themselves replay-UX wins that land independently and soon. Nothing D-012-critical is preempted.

### Expected effect
The tester-facing replay pain (gaps, group-advance, freezes, viewport shifts, snap-backs) is concentrated in the policy table's cells. Closing T8 converts 9+ open evidence tickets into retest-closures in one consolidation instead of nine guard patches — that is the fastest *honest* route to "testers can test properly."

---

## D-012 — ESC-011: false-green retraction ratified; measurement repaired before/alongside fixes; PO live-confirm is the interim acceptance authority

**Date:** 2026-07-14
**Escalation:** ESC-011 (P0) + T0-step-12 addendum
**Track:** T1 ∩ T3 interaction family; T0 harness integrity
**RC:** RC-4 / RC-7 (process)

### Framing
Same disease D-010 diagnosed — validating against a surface that isn't the product — proven one level deeper: the probe lied, and the actuation lies. The Manager's handling was correct on every count (deploy freeze, refusing the 8-row known-failing baseline as "acceptance," treating the honest baseline as the new truth). All five requests ruled below.

### Rulings

**1. Re-verification mandate — GRANTED, two-tier bar.** The permanent bar for any multichart-interaction "proven" claim is **honest probe + real actuation** (real cross-frame mouse/keyboard into the panel iframe at true coordinates, real-state assertions). Until the harness meets that bar, synthetic-actuation green is **development evidence only** and **PO live-confirm on the real built product is the sole acceptance authority** for this family (codifies the step-12 addendum). Every previously "proven" row is retracted to UNPROVEN — **including H-R01/H-R07**; the ratchet floor is withdrawn until re-proven honestly. Status/registry: T1 steps 15/16/17 and the T3 step-4 settings chain move from DONE to **RETRACTED-FALSE-GREEN**; the registry rows they closed reopen.

**2. Shipping posture — CONFIRMED: live stays on fallback-B.** Do not ship the partial-green subset; per the addendum even its assertions are untrustworthy. Fallback-B is the last posture the PO verified by hand — it remains the deploy baseline until the interaction family passes the honest bar AND PO confirms live. Deploy freeze continues.

**3. Consolidated settings-open-transport fix — AUTHORIZED as one root fix.** Gear, dbl-click, and H-R04 all failing to open the real modal from a panel is one transport problem, not three. Owner: Lane 1, one kill-switch, I14-compliant (postMessage transport). Esc/Delete/marquee re-verified separately after it lands — no assumption they collapse with it. Its acceptance is sequenced per ruling 5.

**4. Real-event actuation — APPROVED.** Lane 4 rebuilds the harness actuation layer: CDP `Input.dispatch*` (or equivalent) into the panel iframe at true coordinates; real-state assertions (settings = message-open + visible modal + `hasStyleSection`; deselect = store-level, not chrome-visibility proxy); **all `selectDrawing`/`editDrawing` synthetic fallbacks removed** — if real routing is broken the row must be RED; that is the point. Host-side H-S32/H-S33 get the same honesty pass (no `toolbarVisible` proxies).

**5. Sequencing — HARNESS-FIRST, with a bounded parallel diagnostic (modification of strict serialization).**
- Lane 4 rebuilds the harness now and **owns `react-parity-lib.mjs` exclusively** until the rebuild lands; Lane 1 is forbidden from touching that file (resolves the collision).
- Lane 1's step 18 is **re-scoped diagnostic-first in parallel:** trace the settings-open transport root on the real built product (read-only + instrumentation, no harness-lib edits) so the fix design is ready when the honest harness lands. Lane 1 may implement the gated fix, but **no acceptance claim** until (a) the rebuilt harness is RED-first on the settings rows and goes GREEN with the fix, AND (b) PO live-confirm.
- Interim path if the rebuild is slow: the fix may accept on **PO live-confirm alone** (ruling 1's interim authority), harness row added retroactively — but it goes to a staging build only; the frozen deploy does not move until the family is green.
- Rationale: strict fix-first risks a third false-green cycle; strict harness-first idles the heaviest lane. Diagnose in parallel; accept only against honest measurement.

### Standing rules added
- **New INVARIANTS I15:** a harness assertion may not use a proxy for the user-visible outcome (chrome visibility ≠ selection state; dispatched event ≠ opened modal). Every interaction scenario asserts the end-state the user would see, via real actuation.
- Any "X/X GREEN" acceptance claim must name the **probe** and the **actuation method**. Green on synthetic actuation is labeled **GREEN-SYNTHETIC**, never "proven."

---

## D-011 — ESC-010: panel-B interaction — diagnostic-first, consolidated fix pre-authorized

**Date:** 2026-07-14
**Escalation:** ESC-010
**Track:** T1 (Lane 1) ∩ T3 (Lane 2), build `20260712b26`
**RC:** RC-1 / RC-4

### Rulings
1. **Diagnostic-first APPROVED; consolidated fix (b) PRE-AUTHORIZED** if the root confirms — no second escalation round-trip. Lane 2 moves straight from evidence to fix.
2. **Mandatory step 0 — fallback-posture A/B.** b26 runs the **fallback-B posture** (panels deliberately default to pre-T1 legacy behavior). Before hunting a root, re-run the failing HR-PARITY rows with the **retained migration switches turned ON in the panel**. Any failure that **vanishes** is our own intentional rollback state → belongs to the future **re-migration scope, not a defect to fix now**. Without this we'd burn cycles "fixing" our own revert.
3. **Scope fence on the consolidated fix:** **selection→parent-chrome routing only**, owned by **T3/Lane 2**, with **Lane 1 providing the engine-side emit as a separate gated commit** (file-ownership rule intact). NOT a wholesale fallback reversal. **Peer isolation (H-R07) and marquee (H-R08) stay on their own tracks** unless the diagnostic proves they collapse with the root.
4. **Acceptance per D-010:** HR-PARITY rows GREEN on the real-iframe harness **plus** the parity checklist on the **built product** — dev:live doesn't count.
5. **Sequencing:** steps 15/16 continue as-is; anything per-surface **beyond 16 is held** until the diagnostic returns.

---

## D-009 — ESC-008: A3 replay fixes authorized; tick-vs-interval fork ruled (A)

**Date:** 2026-07-14
**Escalation:** ESC-008
**Track:** T4/A3 (Lane 3)
**RC:** RC-5 adjacent

### Rulings
1. **Both replay fixes authorized**, in order: **cadence correctness first** (`__TALARIA_FIX_REPLAY_INTERVAL_CADENCE`, TAL-01581), **mode-play routing second** (`__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING`, TAL-01582). Two switches, RED-first against the A3 step-2 harness scenarios.
2. **Behavioral fork ruled (A):** **tick mode persists**; the interval **bounds step size only**; the **UI shows both** (mode = Tick, interval = e.g. 4h). Tick + explicit interval must NOT silently fall back to the candle loop.
3. **Acceptance:** harness scenarios GREEN + PO live confirm — **Tick + 4h interval plays as tick animation with 4h step bounds.**
4. Lane 3 free to dispatch the fixes against its new harness scenarios now (manager's "pending ESC-008" note was stale).

---

## D-011 — ESC-010: diagnostic-first approved; consolidated panel-B parity fix pre-authorized on root confirmation

**Date:** 2026-07-14
**Escalation:** ESC-010
**Track:** T1 (Lane 1) ∩ T3 (Lane 2), real-iframe harness findings HR-PARITY#1–#8
**RC:** RC-1 / RC-4

### Rulings

**1. Diagnostic-first APPROVED.** One timeboxed diagnostic (P2) determines whether H-R01 (panel-B selection never reaches the parent V9 chrome) is the common root of H-R04/05/06/09: drive panel-B selection→parent chrome over the postMessage bridge in the real-iframe harness and observe which rows collapse together. The deliverable is discriminating evidence per row — "very likely the root" becomes "measured," or it doesn't.

**2. Mandatory step 0 inside the diagnostic — fallback-posture A/B.** Build b26 runs the fallback-B posture: panels default to pre-T1 legacy behavior with the migration switches OFF. Before any root hunt, re-run the failing HR-PARITY rows with the retained migration switches ON in the panel context (`__TALARIA_DISABLE_TOOL_LIFECYCLE_V2=false`, etc.). Failures that vanish are **re-migration scope** — our own deliberate rollback state, not new defects — and must be labeled as such. Fixing the fallback posture as if it were a bug would burn cycles on our own revert.

**3. On root confirmation, option (b) is PRE-AUTHORIZED — no second escalation round-trip:** one consolidated panel-B interaction-parity fix — parent V9 chrome subscribes to panel-B selection over the postMessage bridge (I14-compliant). Constraints:
- **Owner: T3/Lane 2** (this is contract rows 2/3/4 territory), with Lane 1 providing the engine-side selection emit. File-ownership holds: Lane 1 alone edits engine files; Lane 2 edits React shell/bridge; the two slices land as separate gated commits coordinated by the Manager.
- **Scope = selection→parent-chrome routing only.** Not a wholesale fallback reversal. H-R07 (peer isolation, already a T3 contract row) and H-R08 (marquee) stay on their own tracks unless the diagnostic proves they collapse with the root.
- **Acceptance:** collapsed HR-PARITY rows GREEN on the real-iframe harness (per D-010 — no dev:live acceptance), kill-switch A/B per slice (I3/I13), PO parity checklist on the built product, state matrix covering host/panel × fallback-switch postures.
- If the diagnostic **refutes** the common root, per-surface steps resume and the Manager re-escalates with the evidence table.

**4. Steps 15/16 CONFIRMED in-flight as-is** (concrete, turn H-R13/H-R14 green). Per-surface steps beyond 16 held until the diagnostic returns.

**5. Ledger note:** HR-PARITY#1–#8 are the ratchet for this family. This finding retro-validates D-010 — the breadth of panel-B breakage was invisible until real iframes ran. No panel-B surface is "green" unless green on T0-step9's real-iframe rows.

---

## D-010 — ESC-009: iframe-fix acceptance surface corrected; postMessage-only rule added

**Date:** 2026-07-14
**Escalation:** ESC-009
**Track:** T1 (Lane 1), build `20260712b11`
**RC:** RC-1 / tooling-fidelity

### Mechanism class exposed (the real output of this escalation)
`dev:live` mounts the panel in the **same JS context** as the parent, so any fix coordinating via **parent globals** passes there and **structurally cannot work across a real iframe boundary**. The tool doesn't just miss this bug class — it is **incapable of representing it**. That explains all three burned deploy cycles (steps 11/12/13) at once.

### Rulings
1. **Acceptance surface corrected.** For any fix crossing the parent↔iframe boundary, `dev:live` green is **development evidence only**. Acceptance requires the **real built product** (`build:live` + served), with the build id confirmed **inside the panel iframe**, not just the host frame.
2. **T0-step8 is the durable gate — but NOT a hard serialization** (modification to the Manager's request). Hard-gating iframe fixes on a not-yet-existent harness would idle Lane 1's recovery on Lane 4's timeline. Near-term fixes (step 14 included) may accept via the **manual real-built path** — slower but faithful.
3. **New binding mechanism rule → INVARIANTS I14.** Parent↔iframe coordination must use the **postMessage bridges**. Parent globals, shared closures, and same-context assumptions are **forbidden** in panel-facing code paths. Step 14's in-iframe-signal design is the correct pattern; any prior fix in this family that leaned on parent globals gets re-checked when touched.
4. **Report-labeling correction.** Step 13 said "DONE (proven)" while its own report noted the built-product path was never run — that is **"DONE (dev only) — NEEDS-LIVE"** under the report standard. **The Manager bounces mislabeled reports.** Two of the three lost cycles came from accepting the label instead of the evidence.
5. **T0-step8 raised to Lane 4's top item**, hardened exit: real `MultichartGrid`, real **separate-window** iframes, **build-id assertion inside each panel**, and **one regression scenario per burned fix** (gear route, settings flash, marquee-in-panel) so this class can never ship on fast-loop green again.

---

## D-010 — ESC-009: iframe-panel acceptance surface corrected; dev:live demoted to development-only for cross-window work

**Date:** 2026-07-14
**Escalation:** ESC-009
**Track:** T1 (Lane 1) / tooling fidelity
**RC:** RC-1 + RC-7

### Ruling context

Three consecutive fixes (steps 11/12/13) were fast-loop green and live-broken on the real iframe panel. The mechanism class is now identified and is the important output: **the dev:live mount shares a JS context with the parent, so any fix that communicates via parent globals "works" there and cannot work across a real cross-origin-style iframe boundary.** The tool didn't just miss the bug — it structurally cannot represent it. That is a different and worse failure than a flaky test, and it explains all three cycles.

### Rulings

**1. Request 1 APPROVED — standing acceptance rule (extends D-006/I13):** for any fix whose mechanism crosses the parent↔iframe boundary (panel toolbars, selection sync, settings routing, bridge messages), **dev:live green is development evidence only.** Acceptance requires the real built product — `npm run build:live` + served build (or the T0-step8 parity harness once it exists) — with build id confirmed **inside the panel iframe**, not just on the host frame.

**2. Request 2 APPROVED WITH A MODIFICATION — no hard serialization on T0-step8.** T0-step8 (automated real-React parity harness) becomes the *durable* gate, but in-flight and near-term iframe fixes may accept via the manual real-built path from ruling 1 — step 14 is already written that way and proceeds. Rationale: hard-gating on a harness that doesn't exist yet would idle Lane 1's recovery on Lane 4's timeline; the manual path is slower but faithful.

**3. Mechanism rule for this family (new, binding):** fixes that need parent↔iframe coordination must use **cross-window transports (postMessage via the existing bridges)** — parent globals, shared closures, and same-context assumptions are forbidden in panel-facing code paths. Step 14's design (in-iframe signal posted by the parent bridge) is the correct pattern. Any existing fix in this family that relied on parent globals gets re-checked when touched.

**4. Report-labeling correction (process):** step 13 reported "DONE (proven)" while its own §6 noted the built-product path was unrun. Per `WORKER-REPORT-STANDARD`, a report whose acceptance path is unrun is **DONE (harness/dev only) — NEEDS-LIVE**, never "proven." The Manager bounces mislabeled reports; two lost deploy cycles came from accepting the label instead of the evidence.

**5. T0-step8 priority raised:** it is now Lane 4's top item (ahead of any new scenario families). Exit for T0-step8 must include: real `MultichartGrid` mount, real iframes (separate windows), build-id assertion inside each panel, and one regression scenario per burned fix (gear route, settings flash, marquee-in-panel) so this class can never ship fast-loop-green again.

---

## D-009 — ESC-008: A3 replay fixes authorized; behavioral fork ruled (A) — tick mode persists, interval bounds steps

**Date:** 2026-07-14
**Escalation:** ESC-008
**Track:** A3 (Lane 3)
**RC:** RC-5-adjacent (intake amendment A3; TAL-01581/01582)

### Rulings

**1. Both gated fix tasks AUTHORIZED:** `__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING` (a) and `__TALARIA_FIX_REPLAY_INTERVAL_CADENCE` (b), sharing the prelude (V9 slider wired to the canonical `setStepTimeframe()`; dead `_replayIntervalRawCandles` field deleted). The diagnostic's quality is noted — three stale ownership layers is exactly the kind of mechanism finding A3 was scoped for.

**2. Behavioral fork ruled (A): tick mode persists; an explicit interval bounds step boundaries, it does not silently change the animation mode.** Grounds (P6): the tester's own words — *"When I select TICK BY TICK and enable Replay, it automatically changes to candle by candle"* (TAL-01582) — are a complaint that the mode changed out from under them. The user's explicit mode selection wins; option (B) would codify the surprise instead of removing it. Constraint: with (A), the UI must show both facts (mode = Tick, interval = X) — no state that the label doesn't reflect.
**PO confirmation step:** the (a) acceptance includes a one-line PO live confirm of the (A) behavior (select Tick + interval 4h, press play, verify tick animation with 4h step bounds). If the PO overrules live, (B) is the fallback and the fix's switch makes the swap cheap — do not redesign.

**3. Sequencing CONFIRMED as recommended:** fix (b) first (pure correctness, no fork risk), fix (a) second. Both RED-first against Lane 3's new replay-mode harness scenarios; both quoted to their source tickets (P6); state matrix must cover: single chart + multichart panel × tick/candle × interval set/unset × play/step-forward — the multichart-sync path (`stepTimeframeOverride`) is where (a)'s regression risk lives, since that's the one consumer of the canonical path today.

**4. Standing note:** the prelude deletes a dead field the V9 slider currently writes. Per I3, the prelude rides with fix (b)'s switch (it is load-bearing for both fixes); if (b) is ever kill-switched off live, the slider must still write somewhere coherent — worker verifies the switch-off cell renders today's behavior, not a third broken state.

---

## D-008 — ESC-007: T3 contract rows 13–15 ratified; both open questions ruled per Manager recommendation

**Date:** 2026-07-14
**Escalation:** ESC-007
**Track:** T3 step 1→2 (Lane 2)
**RC:** RC-4

### Rulings

**1. Rows 13–15 owner/transport APPROVED as specced.** All three are parent-shell-owned, consistent with the D-002 split (parent owns focus/chrome/layout structure). Row 11's contract update (TAL-01587 reopen, pointer-capture hypothesis) is noted; it proceeds under the DAILY-INTAKE reopen — no new ruling.

**2. Row 13 storage: extend the existing `chart_panel_state` blob** (Manager recommendation accepted). One persistence owner; a second key invites restore desync on partial writes. Conditions:
- Worker 2 confirms in step 2 that the blob's schema can carry layout-level structure; if it is strictly per-panel-content-scoped, come back with the finding rather than forcing it.
- **Hydrate defensively:** a missing/corrupt/unparseable `layout` field falls back to single-chart layout silently — a bad persisted value must never brick boot. The RED scenario must include the corrupt-value cell.
- Restore is structure-only (layout id + panel count); panel *content* restore stays whatever it is today — no scope growth into content persistence.

**3. Row 15 convergence source: focused panel** (Manager recommendation accepted — matches the ratified "focused panel owns source ticker" model and the PO's spec wording). Constraints:
- Convergence fires on the **false→true toggle edge only**. Boot-with-sync-already-ON and panel-added-while-ON cells are explicitly out of this row's scope; if the PO wants convergence there too, that's a follow-up spec, not silent scope growth (P6 applies — quote the PO's words).
- If the focused panel has no committed `fileId` at the toggle edge (mid-load), the toggle waits for commit or falls back to host A — worker picks one, states it in the fix spec, and the state matrix covers it.
- Peer fan-out must route through the existing `runCommand('loadFile')` path (no new bus). I11 untouched.

**4. I13 reminder binding on all three rows (React work):** rows 13–15 are parent-shell React changes. Kill-switches must cover the React files; harness-green is not acceptance — each row needs `npm run build:live` + the production parity checklist run (per D-006), with build id confirmed per L1. Add one parity-checklist row per contract row when the fixes land.

**5. Sequencing:** RED scenarios for rows 13–15 may be written now (step 2). Fixes dispatch in registry-priority order after the current Lane-2 item (TAL-01564 SW-hygiene) lands; rows 13/15 are independent of each other and of row 14 — Manager may sequence by evidence readiness (row 14 needs the TAL-01574 layout reproduced first).

---

## D-007 — T1 step-7 retest: three-switch isolation matrix + PO spec before step 8

**Date:** 2026-07-13
**Track:** T1 step 7→8 (Lane 1)
**RC:** RC-1

### Correction
The Manager planned to isolate the main-chart blue-border regression with only the step-7 switch (`__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`). Director checked the code first: the blue Ctrl+drag border is **engine-owned**, not React — it's the `ctrlMarqueeSelect` marquee (`chart.js` `drawCtrlMarqueeSelect` ~:18645), and its start predicate (~:31174) depends on manager/engine state that T1 steps 4–6 migrated (`_isCursorSelectMode()`, `currentTool`, hit-tests). Step 6's legacy-retirement also short-circuits old click handlers (`chart.js:32588`, `:32815`). So a main-chart border regression most plausibly lives under `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` or `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` — switches the planned single-switch test wouldn't touch. Testing only the step-7 switch risks a false "pre-existing, not ours" verdict.

### Directives
1. **Three-switch isolation matrix** — `MULTICHART_OWNERSHIP_V2`, `TOOL_LIFECYCLE_V2`, `LEGACY_SELECTION_RETIRE_V2`, one at a time on the **main chart**, build id confirmed. Each outcome maps to a different step-8 fix target; **none** restoring the border ⇒ genuinely pre-existing → log to registry, do not block T1.
2. **Double-click-settings symptom needs a PO-stated spec before any fix** (P6, from D-005): what should single-click do — select + quick menu, with double-click opening settings (TradingView-style)? Lane 1 fixes to a stated spec, not reverse-engineered intent.
3. **Two permanent parity-checklist rows added:** (a) Ctrl+drag marquee border / multi-select; (b) single-click → quick menu → double-click settings → Esc chain — run on **main chart AND a panel** every build.
4. **Step-8 dispatches only after the matrix result:** one proven mechanism, one gated fix.

### Manager mechanism note (for the record)
D-007's "one reload each" cannot be executed literally: these switches are read lazily from `window.__TALARIA_*` with **no localStorage/URL persistence**, so a reload wipes a console-set flag (this also invalidated the earlier "set-then-reload → same" test cited in ESC-006). The matrix is therefore run as **set-flag → Ctrl+drag without reloading** (predicate is evaluated at drag time), build id confirmed once up front. Same isolation intent, valid mechanism. Flagging in case the Director wants a persistent flag shim (localStorage seed) built by Lane 4 for future A/B tests.

---

## D-006 — ESC-006: multichart selection regressions — premise corrected; gating audit ordered before ownership hunt

**Date:** 2026-07-13
**Escalation:** ESC-006
**Track:** T1 step 6→7 (Lane 1)
**RC:** RC-1

### Premise correction
The Manager concluded from the PO kill-switch test (switch ON → R1/R2/R3 persist) that the live selection path "does not run through the gated engine lifecycle." That inference is unsound: T1 steps 4/5 edited the production React surface directly — `MultichartGrid.jsx:4756` (skipV9Dismiss cleanup) and `:5822-5837` (`multichart-close-drawing-settings` handler) — and those edits are **not** behind the engine kill-switch. "Switch off, nothing changes" is equally consistent with our own **un-gated React edits** being the cause. The isolation test cannot distinguish the two theories. Substantively this is an **I3 breach**: steps 4/5 were never fully revertible by their named switch.

### Rulings
1. **No harness-only acceptance for multichart work** — approved unconditionally.
2. **Recovery path (a), reordered.** Step-6 (now step-7) first deliverable is a **gating audit**: enumerate every step-4/5 edit outside kill-switch reach (edit → switch coverage → revertible table), then **A/B-revert the un-gated React edits** against R1–R3 in the real product. This cheapest decisive experiment comes **before** any theory that React owns selection independently. The ownership hunt begins only if the regressions survive with all our edits neutralized.
3. **Fallback (b) pre-authorized** (no further escalation round-trip): if the audit shows the step-4/5 model is wrong for panels, revert and default the multichart migration **OFF** (single-chart stays ON — live-confirmed), ship the PO a stable build, re-migrate once under the parity gate. **Option (c) rejected** — Lane 1 owns the recovery; T3 must not absorb a moving defect.
4. **Production-React parity check = standing gate.** A scripted per-build manual checklist now (select, Ctrl-select, blue border, settings open/close, Esc, per panel); Lane 4 scopes the automated version after recovery. This is the plan-1 §7.7 harness blind spot, now proven twice.
5. **New standing rule (→ INVARIANTS I13).** A fix's kill-switch must cover **every file the fix touches, React included**; anything ungatable gets an explicit callout + real-product verification before acceptance. "Harness-green but ungated-live" is an automatic acceptance blocker.

### Director expectation
The audit will likely show the un-gated edits are the cause (regressions appeared exactly when steps 4/5 landed; single-chart, where the switch covers everything, is fine). If so, the fix is to **re-land the React-side changes properly gated**, not to redesign ownership.

---

## D-001 — ESC-001: T1 ToolLifecycleStore design approved; phased implementation authorized

**Date:** 2026-07-12  
**Escalation:** ESC-001  
**Track:** T1 step 2→3 (Lane 1)  
**RC:** RC-1

### Rulings

**1. Design approved.** The proposed `ToolLifecycleStore` shape, event set, and migration order are approved as the T1 implementation contract. No amendments to the store/events model; the diagnostic ownership table is the authoritative baseline.

**2. Implementation authorized** behind `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` (default ON = fix active). Acceptance contract: H-S32 and H-S33 must go GREEN; kill-switch A/B must turn them RED again. Both engine trees byte-identical; build id bumped.

**3. Phased scope — Manager recommendation accepted.** T1 step 3 implements **migration steps 1–3 only** in the first build:

| Step | Scope | Symptom families targeted |
|---|---|---|
| 1 | Quick menu / floating toolbar + V9 parent sync | stale-quick-menu (24), selection-desync (partial) |
| 2 | Price/time axis labels + on-canvas label groups | price/time labels (41), ghost-after-delete (partial) |
| 3 | Settings dialog + context menu | ghost-after-delete (19), selection-desync (partial) |

Steps 4–7 (object tree, manager flags → store, legacy `Chart.selectedDrawing` retirement, per-tool class migration) are a **follow-on gated task (T1 step 4)** — not in the first build. Do not touch all 30+ tool classes in one diff.

**4. Binding constraints for step 3:**

- **First-click fix mechanism:** `finalizeDrawing` / `addDrawing` paths that create a drawing must emit `toolSelected` through the store (equivalent to full `selectDrawing` subscriber chain) on the same interaction that completes placement. Do not patch individual tool classes to call `selectDrawing` — route through the store.
- **Ghost-after-delete fix mechanism:** `toolDeleted` event must drive `settingsPanel.hide()`, toolbar hide, V9 desync, and context-menu teardown. `deleteDrawing` emits; subscribers react. No per-delete-path cleanup patches.
- **RC-2 stays out of T1 step 3.** The `scheduleRender()` gap noted in the diagnostic is T2 work. If step 3 discovers a render invalidation that blocks H-S32 GREEN, log it to the registry and fix only what the harness requires — do not open a T2 sweep early.
- **RC-3 stays out of T1.** Anchored VWAP bar-index mutation (`drawing-tools-advanced-volume.js:525-531`) is T5. Do not fix during step 3 even if visible in manual testing.
- **I11 holds.** No mirror-frame guard work. T1 is drawing-tools lifecycle only.

**5. State matrix required** in the worker report for step 3: at minimum — single chart / multichart panel × placement-complete / select-existing / delete-via-settings / delete-via-keyboard × settings-open / settings-closed.

### Lane 1 authorization

**Proceed to T1 step 3 immediately.** Lane 1 is unblocked.

First build exit criteria (step 3 only): H-S32 GREEN, H-S33 GREEN, kill-switch RED on both, state matrix delivered, no steps 4–7 landed. Manager verifies independently before requesting T1 step 4 authorization.

---

## D-002 — ESC-002: T3 interaction-parity contract ratified; open questions resolved by RED-isolation

**Date:** 2026-07-12  
**Escalation:** ESC-002  
**Track:** T3 step 1→2 (Lane 2)  
**RC:** RC-4

### Rulings

**1. Canonical ownership split — APPROVED.** The contract table in `T3-INTERACTION-PARITY-CONTRACT.md` is ratified as the RC-4 implementation contract:

- **Panel-local:** selection, drawing target, indicator enable-state, pan bounds, draw/edit keyboard shortcuts, crosshair/label truth.
- **Parent-owned:** `focusedPanelId`, V9 Quick Menu, global settings modal, replay keyboard transport, order rail chrome, unified context menu.

This is the interaction analogue of Plan 1's data-ownership contract. The same standing rule applies: **fixes change ownership to match this table; they do not add guards to preserve today's split.**

**2. Drawing-sync default ON — CONFIRMED intentional.** Cross-panel drawing sync (`multichart-manager.js:101`) stays default ON; it is a product feature. The TAL-01495 fix gates **cross-symbol ghost-apply** (a drawing must never land on a panel showing a different symbol) without changing the default-ON UX for same-symbol panels. If during implementation the worker finds these cannot be separated, that is an escalation, not a default flip.

**3. Row 2 (Ctrl-select collapse, TAL-01498) — RED-isolation approach APPROVED.** Step 2 writes a RED scenario that discriminates between the two candidate mechanisms (inbound `decorateDrawingPointsWithLocalIndices` frame reuse vs parent focus-cleanup racing the selection guard) **before** any fix is designed. The scenario must implicate exactly one mechanism; if both contribute, each gets its own gated fix. No fix lands on an unproven mechanism.

**4. Row 11 (pan bounds, TAL-01491) — measurement probe APPROVED.** Step 2 adds a harness probe measuring host vs iframe effective plot rect (`#chartWrapper` slot geometry vs grid cell) before the fix. The fix targets whichever geometry is wrong per the contract (each tile owns pan bounds for its own canvas); it must not special-case the host tile with an offset constant.

**5. Step 2 scope — CONFIRMED.** Harness scenarios are written only for **retest survivors ∩ contract rows**. T3 remains gated on the PO retest results; no scenario or fix work for rows whose tickets close on b105 retest. Rows marked "verify only" get regression-lock scenarios only if cheap (reuse existing topology), else they're recorded as covered-by-retest.

**6. Ledger correction accepted.** The stale RC-4 citation (`order-manager.js:16626-16643`) is footnoted in ROOT-CAUSES with the corrected evidence (`order-manager.js:7750-7756`, `13374-13430`; `MultichartGrid.jsx:5013-5015`, `5272-5276`, `5905-5914`).

### Constraints restated (binding on step 2–3 workers)

- I11 holds absolutely: the five DEFER-T8 rows (TAL-01480/01488/01489/01496/01497) and the focus-time `dispatchScrollSync` adopt-X path stay out of T3. A step-2 RED that turns out to be mirror-frame policy is re-filed to T8, not fixed in place.
- Row 12's crosshair **sync policy** half (replay + data-range ON) is DEFER-T8; only the label-follows-focus half is T3.
- TAL-01484/01490 (repaint-without-click) belong to T2's invalidation contract if they survive retest — coordinate with Lane 1, do not fix in Lane 2.

### Lane 2 authorization

**T3 step 2 authorized** — proceed immediately for contract rows whose tickets are already confirmed survivors; fill in the rest as the PO retest lands. Step 3 (fixes) requires no further Director checkpoint per row **except** rows 2 and 11, which return with their RED-isolation/probe results before their fixes are dispatched.

---

## D-003 — ESC-003: T1 first build accepted; step 4 authorized (conditional-parallel)

**Date:** 2026-07-12  
**Escalation:** ESC-003  
**Track:** T1 step 3 → step 4 (Lane 1)  
**RC:** RC-1

### Rulings
**1. First build ACCEPTED.** Every D-001 exit criterion met (H-S32/H-S33 GREEN ×3 with kill-switch RED proof, gate 31/31, trees byte-identical, correct store-routed mechanism).

**2. T1 step 4 AUTHORIZED — conditional-parallel** (manager structure accepted): PO live-confirms `20260712b1` while the worker proceeds on steps 4/5/6/7. **A failed live check pauses step 4.**

**3. Added constraint — step 6 is its own gated commit.** Retiring legacy `Chart.selectedDrawing` / `Chart.drawings` index stack must be a **separate gated commit with its own kill-switch**, separable from steps 4/5/7. Rationale: the diagnostic showed legacy readers scattered across `chart.js` (Escape/Delete, context menu, redraw paths) — highest blast radius in the lane; must be independently revertible.

**4. Build-id lineage ratified at `20260712b1`.** Future bumps go **through the Manager** — independent lane bumps only worked this time because files were disjoint.

### Lane 1 authorization
Proceed to T1 step 4 immediately. Acceptance = selection-desync + stale-quick-menu family suites (Lane 4 building) GREEN, step 6 independently gated, both trees byte-identical, kill-switch A/B proof per gated slice.

---

## D-004 — ESC-004: Row 2 fix authorized (new mechanism); Row 11 held for live evidence

**Date:** 2026-07-12  
**Escalation:** ESC-004  
**Track:** T3 step 2 → step 3 (Lane 2)  
**RC:** RC-4

### Rulings
**1. Row 2 (TAL-01498) fix AUTHORIZED on the implicated mechanism.** The probe ruled out both D-002 candidates and implicated a third — local **Ctrl-click double-toggle** (same drawing selected then immediately toggle-deselected within one interaction). Fix lands at the **panel-local selection dispatch site**: one select-vs-toggle decision per pointer interaction. The **host-chart Ctrl-click cell stays explicitly untouched** in the state matrix. The probe's RED is **promoted into the gate** alongside the fix.

**2. Row 11 (TAL-01491) — NO fix on current evidence.** Host and iframe plot rects measured identical → nothing to fix. Manager option (i), tightened: the drag-trace **folds into the already-running PO retest row** (no extra round-trip), reproduced in the exact layout the ticket was filed against, build id confirmed.
- No reproduction (build id confirmed) → **retest-close**.
- Reproduction → bring the trace back for a targeted probe **before** any fix is designed.
- **Explicitly banned:** shipping a host offset constant on today's evidence.

### Lane 2 authorization
Row 2 fix proceeds in T3 step 3 (gated, probe promoted to gate). Row 11 waits on PO retest evidence. Remaining step-3 rows proceed once the PO retest defines the survivor set.

---

## D-005 — ESC-005: T4 order-type auto-reclassification reinstated (accepted deliverable corrected)

**Date:** 2026-07-12  
**Escalation:** ESC-005  
**Track:** T4 (Lane 3)  
**RC:** RC-5

### Primary-source verification (before ruling)
Because this reverses part of an accepted deliverable, the Director re-read the source. **TAL-00752 message #17:** *"…it remains called a market order, even if it was a limit order"* — the tester complained the **label failed to update**, not that the type changed. T4 step 1's "freeze order type on move" (and the invariant built on it) mis-read the ticket. Manager re-interpretation confirmed; PO live requirement matches standard broker behavior.

### Rulings
**1. Reclassification reinstated as its own gated fix** — `window.__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` (default ON = fix active), **decoupled** from step-1 aggregate math and step-2 display/parse switches (both stay). Semantics:
- Buy **below** market → Buy **Limit**; **above** → Buy **Stop**; **at** market (within a **tick tolerance named with one unit per I12**) → **Market**.
- Mirrored for Sell.
- **Each multi-entry leg classifies independently.**

**2. Invariant #3 revised** to: *"on move, order type always equals the correct classification for its price relative to market, per side."* RED-first property tests cover **both sides × all three zones × zone-crossing drags × independent multi-entry legs**. The old invariant's tests are **replaced, not just deleted**.

**3. TAL-00752 discharged** in the direction the tester asked for; registry row cites this ruling.

**4. Acceptance includes a PO live spot-check:** drag one buy entry through all three zones, watch the label transition **Limit → Market → Stop**.

### Process correction (standing rule)
T4 step 1 was accepted without a Director checkpoint (within Manager authority) but a mis-read product-behavior invariant survived to production. **New standing rule (now INVARIANTS P6): any product-behavior invariant in an acceptance report must quote the source ticket — one line of evidence per invariant.**

### Lane 3 authorization
Reclassification task unblocked. Keep step-1/step-2 switches intact.

---

## D-003 — ESC-003: T1 first build accepted; step 4 authorized with legacy-retirement isolation

**Date:** 2026-07-12  
**Escalation:** ESC-003  
**Track:** T1 step 3→4 (Lane 1)  
**RC:** RC-1

### Rulings

**1. First build ACCEPTED.** All D-001 exit criteria met and manager-verified: H-S32/H-S33 GREEN ×3, kill-switch RED ×3, gate 31/31 clean, steps 1–3 only, RC-2/RC-3 out, trees byte-identical, 16-cell state matrix, I11 held. The mechanism is the ruled one (store-emitted `toolSelected` on placement-complete; `toolDeleted` driving subscriber teardown).

**2. T1 step 4 AUTHORIZED — manager's conditional-parallel structure accepted.** PO live-confirmation on `20260712b1` runs in parallel (first-click works, no ghost-after-delete, kill-switch A/B reproduces live, build id confirmed per frame per L1). If the live check fails, step 4 pauses and re-escalates; work done meanwhile stays on its kill-switch.

**3. Step 4 internal structure — one constraint added.** Migration steps 4, 5, and 7 (object tree, manager flags → store, per-tool chrome subscription) may land as one gated build. **Step 6 (retiring the legacy `Chart.selectedDrawing` / `Chart.drawings` index stack) must be its own gated commit with its own kill-switch** (suggest `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE`), independently revertible. Rationale: the step-1 diagnostic showed legacy readers scattered through `chart.js` (Escape/Delete handling, context menu, redraw paths) — this is the highest-blast-radius slice of Lane 1 and must be separable from the rest of step 4 if something surfaces live.

**4. Step 4 acceptance contract:** the four family suites per TRACKS T1 exit — H-S32/H-S33 stay GREEN, plus the selection-desync and stale-quick-menu RED scenarios being staged by Lane 4 go GREEN; kill-switch A/B on each; full gate clean; state matrix covering single/multichart × the migrated surfaces; 10-ticket manual spot-check from the registry (TRACKS exit) delivered with the report.

**5. Build-id lineage RATIFIED.** Canonical build id is `20260712b1`; future bumps continue from there. Going forward, lanes coordinate bumps through the Manager to avoid parallel lineages (two lanes bumping independently was harmless this time because files were disjoint — do not rely on that again).

---

## D-004 — ESC-004: Row 2 fix authorized on the new mechanism; Row 11 goes to live drag-trace

**Date:** 2026-07-12  
**Escalation:** ESC-004  
**Track:** T3 step 2→3 (Lane 2)  
**RC:** RC-4

### Row 2 (Ctrl-select collapse, TAL-01498)

**1. Updated mechanism ACKNOWLEDGED.** The probe did exactly what D-002 demanded — implicate exactly one mechanism — and the answer (local Ctrl-click double-toggle: the same drawing id is selected then immediately toggle-deselected within one interaction) rules out both original candidates with clean discriminating evidence. This is the process working: we almost dispatched a fix against the wrong mechanism.

**2. Step-3 gated fix AUTHORIZED** on the panel-local Ctrl-click selection dispatch: **one select-vs-toggle decision per pointer interaction** (dedupe the double dispatch at the dispatch site, not by suppressing toggle semantics). Constraints:
- Fix lives in the selection dispatch path (consistent with ratified panel-local ownership) — not in per-tool code, not in the parent bridge.
- Plain-click select/deselect semantics and single-chart Ctrl-click behavior unchanged — state matrix must show the host-chart Ctrl-click cell untouched.
- The probe's RED becomes a promoted gate scenario with the fix (kill-switch A/B), per I2. Coordinate with Lane 1: if T1 step 4's manager-flags migration moves this dispatch site, the fix lands on the store path, not the legacy path.

### Row 11 (pan bounds, TAL-01491)

**3. Disposition (i) ACCEPTED — live drag-trace before any closure.** The harness probe measured host and iframe plot rects identical, so there is nothing to fix on current evidence — but the harness ran a 2-panel topology and cannot exonerate the production layout the ticket was filed against. Ruling:
- Fold the drag-trace into the already-running PO retest (no extra round-trip): the TAL-01491 retest row gains a step — reproduce in the **exact layout from the ticket** (panel count, which tile, fullscreen state) with the trace probe capturing pointerdown/move/up + `offsetX` deltas + plot rects.
- If it does not reproduce with build id confirmed (L1): **retest-close**, no fix.
- If it reproduces: the trace comes back to the Manager for a targeted probe against that topology; fix only after the geometry violation is measured. **No host offset constant on today's evidence** — the probe explicitly does not justify one.

**4. Probe hygiene NOTED AND APPROVED:** the diagnostic probe stayed out of the ratchet gate (I9 intact). Keep `t3-row2-row11-probe.mjs` as a diagnostic asset; promote only the row-2 RED (as a proper scenario) with its fix.

---

## D-005 — ESC-005: order-type auto-reclassification reinstated with correct semantics; T4 invariant #3 revised

**Date:** 2026-07-12  
**Escalation:** ESC-005  
**Track:** T4 (Lane 3)  
**RC:** RC-5

### Ticket-evidence check (Director-verified against the source thread)

TAL-00752 message #17 reads: *"When I add more than one entry and move the second entry, its location changes and it remains called a market order, even if it was a limit order."* The tester's complaint is that the label **failed to update to the correct type** — not that it changed. The T4 step-1 "freeze order type on move" decision, and property invariant #3 as accepted, mis-read the ticket. The manager's re-interpretation is confirmed by the primary source, and the PO's live requirement (standard broker mapping) matches it.

### Rulings

**1. Auto-reclassification REINSTATED — new gated fix authorized** under `window.__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` (default ON), decoupled from the step-1 aggregate-math switch and the step-2 display/parse switches, all of which stay intact. Semantics are the standard broker mapping, per side:
- Buy: below market → Buy Limit; above market → Buy Stop; at market (within tick tolerance) → Market. Mirror for Sell.
- Applies on entry-line drag and on programmatic price moves; each leg of a multi-entry order reclassifies independently.
- The tick tolerance for "at market" must be named with one unit (I12) in the fix spec.

**2. Property invariant #3 REVISED** from "order type never mutates on move" to: **"on move, order type always equals the correct limit/stop/market classification for its price relative to market, per side."** RED-first property tests assert the full mapping: both sides × all three zones × zone-crossing drags × multi-entry legs independently classified. The old invariant's tests are replaced, not merely deleted — coverage may not shrink.

**3. TAL-00752 disposition CONFIRMED.** With aggregates fixed (step 1, kept), display/parse fixed (step 2, kept), and reclassification now *correct* rather than frozen, message #17's defect is discharged in the direction the tester actually asked for. The registry row for #17 cites this ruling.

**4. Acceptance:** corrected mapping property suite GREEN in CI; kill-switch A/B; live drag spot-check by the PO (drag one buy entry through all three zones, confirm label transitions Limit → Market → Stop); state matrix including the multi-entry and replay-paused cells; both trees byte-identical; build bump coordinated through the Manager per D-003.

**5. Process note (for the ledger).** T4 step 1 was accepted by the Manager without a Director checkpoint — within the manager's authority, but the mis-read invariant survived until the PO felt it live. Standing correction going forward: **any worker-proposed product-behavior invariant (as opposed to a code-correctness invariant) is quoted back to the source ticket in the acceptance report** — one line of evidence per invariant. Cheap, and it would have caught this at acceptance time.

---

## D-006 — ESC-006: T1 multichart recovery — gating audit first; the isolation test is invalid evidence

**Date:** 2026-07-13  
**Escalation:** ESC-006  
**Track:** T1 (Lane 1), build `20260712b8`  
**RC:** RC-1

### Director correction to the escalation's premise

The escalation reads the PO's isolation result (`__TALARIA_DISABLE_TOOL_LIFECYCLE_V2 = true` → R1/R2/R3 persist) as proof that "the live multichart selection path does not run through the gated engine lifecycle." That inference is **unsafe**. Director verification: T1 steps 4/5 edited the production React surface directly — `MultichartGrid.jsx:4756` (`skipV9Dismiss` handling in `clearDrawingUiOnOtherPanels`) and `:5822-5837` (`multichart-close-drawing-settings` message handler) — and **those React-side edits are not behind the engine kill-switch.** "Switch off, no change" is therefore consistent with *our own un-gated React edits being the cause* of R1–R3. The isolation test cannot distinguish "React owns selection independently of our work" from "our un-gated React changes broke it." This is also an I3 breach in substance: the step-4/5 fixes are not fully revertible by their named kill-switches.

### Rulings

**1. Request 1 APPROVED unconditionally.** No further T1 multichart fix is accepted on harness evidence alone. Every T1/T3 multichart-affecting change requires a real-product (React `MultichartGrid`) reproduction before fix and verification after, until ruling 4's parity check exists.

**2. Recovery path: (a), but the first deliverable is a GATING AUDIT, not a selection-ownership hunt.** The Lane-1 step-6 diagnostic must, in order:
   1. **Enumerate every change steps 4/5 made outside the kill-switch's reach** — all `MultichartGrid.jsx` edits, any bridge/manager edits not guarded by `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` (or guarded by a different switch). Deliverable: a table of edit → switch coverage → revertible yes/no.
   2. **A/B the un-gated React edits** against R1/R2/R3 in the real product (revert them locally, reload, retest). This is the cheapest decisive experiment and must come before any new mechanism theory.
   3. Only if R1–R3 persist with all step-4/5 edits neutralized does the diagnostic proceed to mapping the React surface's independent selection ownership.
   
**3. Fallback (b) is pre-authorized without re-escalation** if the audit shows the step-4/5 model itself is wrong for panels: revert the un-gated React edits and default the T1 multichart migration OFF for panels (single-chart migration stays ON — it is live-confirmed). Ship the PO a stable build first; re-migrate once under ruling 4's parity gate. Option (c) is REJECTED: Lane 1 introduced these regressions, Lane 1 owns the recovery; T3's contract work continues separately and must not absorb a moving defect.

**4. Request 3 APPROVED — production-React parity check becomes a standing acceptance gate.** Minimum viable version now: a scripted PO/manager checklist (select, Ctrl-select, blue border, settings open/close, Esc, per panel) executed on the real product per build. Harness-automated React coverage is the durable version — Lane 4 scopes it after the recovery lands (it is the same blind spot the journey report's §7.7 warned about, now proven twice).

**5. Standing rule (ledger + INVARIANTS).** **I3 is amended in practice: a fix's kill-switch must cover every file the fix touches, including React/shell surfaces.** If a change cannot be gated (e.g. React markup), the acceptance report must say so explicitly and the change gets real-product verification before acceptance. The step-4/5 acceptances that missed this were harness-green but ungated-live — that combination is now an automatic acceptance blocker.

**6. T1 status:** acceptance stays revoked (~70%); H-S32–35/44 remain the harness contract but are **necessary, not sufficient** for multichart claims until the parity check exists. PO keeps `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2=true` only if the audit shows it actually helps; otherwise the audit's revert build is the PO relief.

---

## D-007 — Step-7 retest residuals (R2 border, single-click settings): isolation matrix corrected before the next PO cycle

**Date:** 2026-07-13  
**Trigger:** MANAGER-FINDINGS "T1 step 7 first live retest — PARTIAL" (not an escalation; Director directive to prevent a wasted PO cycle)  
**Track:** T1 (Lane 1), build `20260713b1`

### Director code check (evidence)

The manager's planned isolation tests only `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2` on the main chart. That switch cannot be the whole story, and testing it alone risks a false "pre-existing" verdict:

- **R2 (blue Ctrl+drag border) is engine-owned, not React-owned.** The border is the `ctrlMarqueeSelect` marquee drawn by `chart.js` (`drawCtrlMarqueeSelect`, `chart.js:18645`; overlay sync `:18713`). Its start predicate (`tryStartCtrlMarqueeSelect`, `chart.js:31174-31238`) depends on engine/manager state that T1 steps 4–6 migrated: `dm._isCursorSelectMode()` (= `!currentTool`, `drawing-tools-manager.js:13105-13107`), `dm.currentTool`, drawing hit-tests, and `this.tool`. Step 7 touched only `MultichartGrid.jsx` and is panel-gated — a main-chart border regression is far more plausibly **T1 steps 4/5/6 engine work**, i.e. under `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` or `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2`.
- **Step 6 rewired the click paths that lead to selection UI.** With legacy retirement active (default), the legacy SVG/canvas click handlers return early (`chart.js:32588`, `:32815`, `:33787`) and selection chrome depends entirely on the new store path. If the store path doesn't drive the border/preview, that is a step-6-visible regression — again invisible to the ownership-V2 switch.

### Directives

**1. Isolation is a three-switch matrix, one PO reload each, main chart, build id confirmed (L1):**
| Test | Switch set | If border returns |
|---|---|---|
| a | `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2=true` | step 7 leaked into single-chart (I5 breach) — Lane 1 re-scopes step 7 |
| b | `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2=true` | T1 store migration owns it — step-8 fix in the store's selection-chrome path |
| c | `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2=true` | step-6 retirement dropped the marquee/border wiring — step-8 fix restores it on the store path |
If none restores it: treat as pre-existing/unrelated, capture live trace, register as a registry row instead of a T1 blocker.

**2. "Settings opens only on double-click" needs a product-behavior spec before any fix (P6).** The intended single-click behavior must be stated by the PO (expected: single-click = select + quick menu; double-click = settings — TradingView convention) and quoted in the step-8 prompt. Lane 1 must not guess the spec from the regression report; the earlier b6 symptom (A) and this one must be fixed to the *same* stated spec.

**3. Parity checklist gains two permanent rows:** (i) Ctrl+drag marquee shows border and completes multi-select; (ii) single-click select → quick menu appears → double-click opens settings → Esc closes all — each run on main chart *and* a panel.

**4. Step-8 dispatch is gated on the matrix result** — one mechanism, one gated fix, RED-first on the real product per I13/D-006. No fix lands on "probably the store path."

---
