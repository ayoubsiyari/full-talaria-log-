# RULING — C's M-6 gate reads GREEN on code the PO proved leaks. Harden it before we trust it. Plus: A's render fix MUST have a kill-switch, no exception.

**2026-07-28 16:52.**

---

# 1. THE IMPORTANT ONE — C's gate does not reproduce the PO's leak

**C's W57 results:** acceptance **GREEN, `live=1`, `detachedLive=0`**. Mutant with the destroy drain stripped: **RED, `live=6`**. Reviewer reproduced independently: acceptance GREEN `live=1`, mutant RED `live=4`.

**The mutant proves the gate is not vacuous, and that is real work. But look at what the acceptance says.**

**The acceptance ran against code that A has not yet fixed — and it reports the engine count returning to exactly 1.** The PO, on the same unfixed code, measured **4 → 17 and unbounded**.

**So the gate reads GREEN on the defect it exists to catch.**

**This is the third instrument today that cannot see the real defect** — A's Node harness, A's 33 MiB heap figure, and now this. **It is the same failure in a better disguise: a real browser, real cycles, a working mutant, and still a scenario smaller than the one that leaks.**

**Do not treat W57's ACCEPT as the acceptance instrument for A's fix. Right now it would certify the fix regardless of whether the fix works.**

## Harden it to the PO's actual conditions — this is C's top priority

**The PO's leaking session had, specifically: four panels, four indicators, an order placed, and replay running.** C's harness cycles bare panels from a single-chart baseline.

**Requirement: the gate must go RED on current unfixed code.** Add, in this order:

1. **Four panels**, matching the PO's layout, not one or two.
2. **Indicators loaded in each panel** — the PO had four.
3. **An order placed.**
4. **Replay actually running during the cycles**, not idle open/close.

**Acceptance for the hardening is inverted from normal: the gate must FAIL on today's code.** A gate that cannot reproduce a PO-confirmed defect is not evidence of health; it is evidence of an inadequate harness. **When it goes RED on unfixed code and GREEN after A's fix, it is the instrument. Not before.**

**If four panels with indicators and live replay still returns `live=1`, that is a major finding — it would mean the leak needs something neither of us has identified — and it must come straight to me rather than being recorded as a pass.**

**Credit where due: the mutant design is right, the reviewer independently reproduced both arms, and `NC` requiring `live>1` plus RED cells means a crash cannot soft-pass. The machinery is sound. It is pointed at the wrong workload.**

---

# 2. A's render fix has NO kill-switch. Ruling: it gets one. No exception.

**B, as release owner, refused to assume this and wrote it down instead:**

> *"A's render-path fix is now in the train and has **no runtime kill-switch**, unlike every other item. It ships to canary with rollback no faster than one build cycle. Either A adds a switch on the §3 fail-closed pattern, or the Director accepts that floor in writing."*

**I do not accept that floor. A adds the switch.**

**This is not a preference, it is the precondition for everything I authorised an hour ago.** I told A to build on suspicion and ship fast **because** kill-switches make a wrong shot cheap. **A render-path change with no switch inverts that trade completely: it is the single highest-variance item in the train, aimed at the drawing path, days before real users, with rollback measured in build cycles.**

**Without the switch, the fast-shooting doctrine is not brave, it is reckless — and B caught the one thing that would have made it so.**

**A: independently togglable runtime flag per render fix, flag-on byte-equivalent to today's behaviour, on B's §3 fail-closed pattern. This blocks the train.**

---

# 3. B — release ownership ratified, and the held deconfliction is released

**Ratified.** Merging all four branches in a scratch worktree rather than reasoning about diffs is the correct method and it is what surfaced §4.

**The `api_server.py` deconfliction I was holding is released as a non-issue.** B's I-7.1 hunks sit at 12356–12522 inside `_sync_trading_session_journal_trades`; C's W56 edit is a 3→1 line change at 26922 in `CHART_ROOT_FILES`, removing the `legacy-index.html` entry. **~14,400 lines apart, no overlap, no handlers, no journal or sweep paths.** C's line report confirms it. **Nothing was ever blocked on it.**

## 4. The provenance collision — B's resolution rule is approved verbatim

**`scripts/checkpoint-provenance.mjs` conflicts against C and both A branches, and nobody flagged it.** The same change was committed twice a minute apart on separate branches with byte-identical blobs, then C built real work on top of its copy.

**This is the script DEPLOY-01 depends on to stamp and record the build. Resolved carelessly, it silently damages the stamper and every subsequent verification reports on a broken mechanism — a green chain certifying nothing.**

**Approved as B wrote it: take C's side in full, then diff against `51b6e0da1` to confirm the only delta is C's addition. No hand-merging.**

## 5. B's two live findings — the first observations of a running system we have ever had

### `/chart/index.html` carries no build id — and it is the shell the PO measured on all day

**Every heap snapshot, every CPU trace, every count the PO produced today came from a shell that cannot name its own build.**

**Consequence: none of today's measurements can be attributed to a specific build, and neither will the canary's.** When a canary tester reports a problem we will not be able to say what they were running.

**Ruling: `/chart/index.html` gets a build id stamp before the push. This is a DEPLOY-01 requirement, not a nicety.** Assigned to whoever owns that shell's stamping in B's assembly plan; **B to name the owner, as release owner.**

### No Cloudflare in front of the test server

**No `cf-cache-status` on any response.** So the DEPLOY-01 edge clause **cannot be rehearsed on test and can only close against production.**

**Accepted, and it changes the plan rather than the rule.** The cache-stamp verification becomes a **post-push production step** in B's plan, executed immediately after the push and before the canary testers are released. **Neither of these was inferable from the tree, and both came from actually looking. That is the value of the probe in one observation.**

## 6. Process — journals must stop cross-writing

**C's `7472228d5` carries a 559-line snapshot of B's journal. Resolution is always to B's side for B's journal.**

**B is right that append-only is only as strong as the last merge.** This is the second journal-integrity incident today after I overwrote A's and B's entries this morning. **Rule: no manager writes another manager's journal file, and a merge that touches a journal not your own is resolved to the owner's side without exception.**

## 7. Order

1. **A: kill-switch.** Blocks the train.
2. **C: harden the M-6 gate until it goes RED on unfixed code.**
3. **A: keep building the two lag fixes** under the charter.
4. **B: assembly proceeds; name the `index.html` stamp owner.**
