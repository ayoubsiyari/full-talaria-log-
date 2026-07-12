# WORKER PROMPT — T3 step 1 (Lane 2): Interaction-parity contract DRAFT

> QUEUED. Hand this to the Lane 2 (panel) worker **the moment they deliver `T3-RETEST-CHECKLIST.md`** — do NOT wait for the PO to finish retesting. This is pure design work, independent of retest outcomes, so it keeps Lane 2 busy during the tester's retest window. **No code fixes this step.**

---

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T3 step 1**, Lane 2. You have just delivered the retest checklist; the tester is now retesting in parallel. This step drafts the **interaction-parity contract** so that, once survivors are known, the RED scenarios + fixes (steps 2–3) can start immediately.

## READ FIRST (binding)
- `docs/tickets-overhaul/README.md`, `ROOT-CAUSES.md` (**RC-4**), `INVARIANTS.md`, `TRACKS.md` (**T3**, Lane-2 standing rule).

## BINDING INVARIANTS
- **I1** — RC-4 (panel interaction parity).
- **I11 — mirror-frame guard tail is FROZEN.** The contract defines *interaction ownership* (selection, menu, settings, keyboard, focus, indicator enable-state) — it does NOT touch replay mirror-frame application. Any row whose mechanism is data/X/Y frame adoption is **DEFER-T8**, not a contract row.
- **L2** — production tree `multichart-prod/` only; never the legacy `multichart/` dev-shell.
- **P2** — one session; **P4** — the contract table goes to the Director for approval before any fix (this is a design checkpoint).

## TASK (draft a contract table — no code changes)
Mirror the data-ownership contract that closed Plan 1, but for **interaction**. Deliver a table where each row is an interaction surface and each column names the owner + transport, with today's actual behavior cited (file:line) and the target behavior:

| Surface | Today: owner + transport (file:line) | Failure symptom (ticket) | Target owner | Transport | Notes |
|---|---|---|---|---|---|
| Selection (click-to-select, Ctrl-select) | ? | TAL-01498 Ctrl-select fails on 2nd chart | panel-local? | | |
| Quick Menu | ? | TAL-01499 no quick menu on panel | | | |
| Settings dialog | forwarded to parent (`embed-bridge.js:186-249`) | | | | |
| Keyboard shortcuts / focus | host order rail (`order-manager.js:16626-16643`) | | | | |
| Drawing target (which panel receives the draw) | ? | TAL-01495 draws on wrong panel | | | |
| Indicator enable-state isolation | ? | TAL-01500/01501 state leaks across layouts | panel-local | | |
| Drag bounds within frame | ? | TAL-01491 drag stops at frame box | | | |

For each surface, cite the current owner/transport with file:line evidence from `sync-bridge.js`, `embed-bridge.js`, `panel-cmd-bridge.js`, and `order-manager.js` (the RC-4 evidence anchors). Recommend the target owner (panel-local vs host-forwarded) and transport (direct vs postMessage), and flag any surface that must **defer to T8** (mirror-frame policy) rather than be re-owned here.

Do NOT implement anything. The output is a design table for Director approval; fixes (RED-first, one gated `__TALARIA_*` per row) come in T3 step 2/3 against the surviving tickets from the retest.

## KILL-SWITCH
- N/A (design). Each step-2/3 fix will get its own flag.

## DELIVER (report back to the PO as a `.md`)
1. The interaction-parity contract table (all surfaces, today→target, file:line evidence).
2. Per-surface owner/transport recommendation + any DEFER-T8 flags with reasons.
3. Explicit confirmation: no files edited; legacy `multichart/` untouched.

## STOP CONDITIONS
If a surface's ownership is genuinely mixed/undeterminable from the code, record it as an open question for the Director rather than guessing. If a fix is tempting, STOP — this step only produces the contract.
