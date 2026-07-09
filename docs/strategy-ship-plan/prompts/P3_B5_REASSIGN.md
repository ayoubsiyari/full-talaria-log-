# PROMPT — B5 REASSIGNMENT — Builder polish (Worker B is unavailable)

You are taking over **B5** because the original Worker B is no longer available. The manager has
temporarily transferred Worker B's ownership zone to you for THIS task only. You have never seen
this file before — treat this prompt as fully self-contained.

## 0. Orient first (do this before editing)
- Open `Sources Handoff/TalariaV16.jsx` (~59k lines). Your zone is the strategy Builder modal:
  `StrategyBuilderModal` and `GeneralInfoStepContent` (search by name; roughly lines 5680–8650).
- Run `git diff -- "Sources Handoff/TalariaV16.jsx"` and check whether the departed Worker B left
  any PARTIAL B5 edits. If partial work exists, finish/repair it rather than duplicating. Report
  what you found.

## 1. Working rules (critical — shared 1-file project)
- You hold an EXCLUSIVE lock on the file. Only you edit it this turn.
- DO NOT switch git branches, `git stash`, `git checkout`, or revert. ALL prior work from other
  workers (Phases 1–2 and C3/C4) lives as UNCOMMITTED changes and MUST be preserved. The manager
  handles all git/commits centrally.
- Re-locate every symbol by NAME (line numbers drift). Stay inside the Builder-modal zone.
- No new dependencies. Do NOT loosen any validation (image type/size, name limits).
- Do NOT edit `saveBuilder`, `openBuilder`, or parent state — if you truly need a change there,
  STOP and file an Interface Change Request (ICR) to Worker A instead (note it in your report).
- Keep the existing visual language: colors come from the `c` object, font from `F`, reuse
  existing button/input styles. No redesigns.

## 2. B5 tasks
1. **Missing-required-fields names.** There is a computed value `generalInfoMissingLabels` that is
   currently unused. When the step-1 "Next" button is blocked because required fields are empty,
   render the *names* of the missing fields as a message (not just red borders). Use existing
   notice/text styling in the modal.
2. **Mobile cover images.** On mobile/compact layout the image limit is 4 (desktop 6). Currently
   the Add tile shows until 6 and errors on tap at the mobile limit. Instead, HIDE/DISABLE the Add
   tile once the mobile limit (4) is reached, so there is no error-on-tap.
3. **Per-tag length cap.** Add a per-tag character cap (24–32 chars) with input truncation and/or
   feedback so a single tag can't be arbitrarily long.
4. **(Only if trivially in-zone)** make the `mobileSymbolPicker` width check responsive to window
   resize. Skip if it reaches outside the zone.

## 3. Verify (static this turn; runtime/browser is deferred to Phase 4)
- Blocked "Next" shows the specific missing field names.
- Mobile at 4 images → no Add tile (not an error on tap).
- Overlong tag → truncated/blocked with feedback.
- `ReadLints` on `Sources Handoff/TalariaV16.jsx` → no new diagnostics (if the tool times out on
  the large file, retry once and note it).
- `git diff --check` clean; `git diff` shows your hunks are inside the Builder-modal zone only.

## 4. Report
Write `docs/strategy-ship-plan/reports/B/B5.md` using the task-report format:
- What changed (file, symbols, current line ranges, nature)
- Whether you found/finished any partial Worker-B work
- Zone compliance, any ICR filed
- Verification table (steps / expected / observed / pass)
- Lint result, `git diff` presence
- Status: DONE / BLOCKED (with exact blocker)

Then hand the file back to the manager (do not start any other worker's task).
