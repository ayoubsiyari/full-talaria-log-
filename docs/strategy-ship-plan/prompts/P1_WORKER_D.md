# PROMPT — Worker D — Phase 1 (Strategy Bank Page & UI Surface)

You are **Worker D** on the Strategy ship-ready effort. You fix bugs; you do not redesign.
Work only inside your ownership zone. Report after the task. Read this whole prompt first.

## 0. Working rules (read first)

- **Isolation:** work in your own git worktree/branch (`ship/worker-d`). Do NOT commit to
  `main`. Do NOT merge. The Manager integrates later.
- **File under work:** `Sources Handoff/TalariaV16.jsx`. **Line numbers drift — re-locate
  every symbol by name before editing** and record actual current line ranges in your report.
- **Do not edit outside your zone.** `runDelete` / `saveBuilder` / `openBuilder` /
  `fillStrategyBuilderFromTemplate` are Worker A's — ICR only (none needed for Phase 1 D1).
- **Security guardrails non-negotiable;** no new dependencies. Keep the existing visual
  language; no layout redesigns. No console errors introduced.

## 1. Your ownership zone (WRITE access only here)

`Sources Handoff/TalariaV16.jsx`, strategy-related blocks only:
- Strategy state declarations (**~11720–11970**): `myStrategies`, `savedCommunityIds`,
  `savedCommunityStrats`, `stratTab`, `stratStyleFilter`, `hiddenTemplateIds`, `stratB*`
  state, community refresh effects.
- Left-nav stratbank wiring (**~15179–15260**) — read mostly; edit only if the task requires.
- Bank page block (**~45400–46015**): `stratBankRows`, `mineSource`, filters, sorts,
  skeletons (`StratRowsHeader`, `Strat*Skeleton`), card/row renderers, `StrategyRowAction`.
- Tab bar, list render, action menus, share modal, and the `TemplatePickerModal` +
  `StrategyBuilderModal` **instantiations** (**~46393–46930**).

## 2. Task (Phase 1)

### D1 — Execute Director decision D-1 on the community/share surface
**Director decision D-1 = (a) strip/feature-flag for this release. CONFIRMED — proceed.**

Scope under (a): introduce a single constant in your zone, `COMMUNITY_ENABLED = false`, and
remove or gate behind it every dead community/share surface:
- The unreachable Share-to-Community modal (`stratShareStrat` UI).
- The decorative "Include in post" checkboxes.
- The `display:"none"` card action bar with onClick-less "Use Strategy" buttons.
- The dead `StrategyRowAction` component.
- The session-only `saveCommunity` bookmark toggle.
- The Saved-tab empty-state CTA that targets the hidden community tab.

**Keep intact (dormant, NOT deleted)** so option (b) stays cheap later: community fetch
plumbing, backend routes, the hidden-tab comment structure. Do NOT delete backend community
routes or fetch plumbing. Anything ambiguous → stop and note it for the Manager.

- **Visible result:** a user on the Strategies page can never reach a dead end related to
  community/share.
- **Verify (click-crawl):** crawl the entire page — cards, rows, ⋮ menus, empty states, BOTH
  layout modes (cards + rows), demo + live mode. No control references community/share; no
  console errors; My Strategies flows unaffected.

## 2b. MUST ALSO acknowledge: ICR-5 and ICR-6 (Worker A wired into YOUR zone)

Worker A's A1/A2 already landed edits inside your `~11720–11970` state/effect zone. You OWN
that zone, so you must confirm D1 does not clobber them and note them in your report:
- **ICR-5 (A→D):** the embedded boot-sync effect (~11241–11248) and the strategy-bank
  `applyBank`/`syncBank` effect (~11822–11854) now do a stale-aware merge. Do NOT remove or
  restructure these while stripping community surfaces.
- **ICR-6 (A→D):** `const strategyDeleteInFlightRef = useRef(new Set());` (~11803) — a delete
  double-fire guard. Do NOT delete/rename it in any dead-code sweep.
See `../reports/A/ICR-5.md` and `../reports/A/ICR-6.md`. In your D1 report, add an
"ICR-5 / ICR-6 coexistence" line confirming both effects/refs remain intact and D1's changes
don't overlap those exact lines.

## 3. Do NOT do in Phase 1
- Do not start D2/D3/D4 (later phases). No markets-restore verification, no sort/filter
  honesty, no broader dead-code sweep yet — EXCEPT the specific dead surfaces D1 lists above.
  Reading to prepare is fine.
- Do not change `mergeV16StrategyBankRows` usage semantics (Worker A owns that contract).
- ICR-2 (lifted state) and ICR-3 (`hasExistingGroups`) arrive in Phase 2 — not now.

## 4. Reporting (required)

Produce a task report for D1. Save to `docs/strategy-ship-plan/reports/D/D1.md` AND paste the
full report text into your final message to the Manager.

Report must contain:
1. **What changed** — table File | Symbol(s) | current line range | nature; + 2–5 sentence
   summary. Explicitly list each community/share surface and whether it was removed or gated.
2. **Zone compliance** — all hunks in zone; backend routes/fetch plumbing untouched;
   `mergeV16StrategyBankRows` semantics unchanged; no new deps; ICRs (none).
3. **Verification evidence** — the full click-crawl as a reproducible steps table (step |
   expected | observed | pass), covering cards+rows and demo+live; lint result; "console
   errors introduced: none/<list>".
4. **Risks & notes** — anything left dormant and how to re-enable it later (the `COMMUNITY_ENABLED` switch).
5. **Blocked?** — only if BLOCKED.

Set **Status:** DONE / BLOCKED, then hand back to the Manager.
