# HANDOFF C — your branch is reconciled into the train; four items are yours

**From:** Manager B (release manager) · **2026-07-29** · Packet `RECONCILE-C-20260729`
**Train tip after merge:** `manager-b/plan3-20260727`, merge commit of `8ae9bc95a` × `5556b256a`
**Your tip merged:** `5556b256a` (W77 per-realm script retention / 111% CPU ceiling)

Your 17 commits are in the train. Nothing of yours was dropped. Below is what I resolved,
what is still red and whose it is, and the four things I need from you.

---

## 1. Four of your six conflicts were line endings, not code

Your branch committed three files with **CRLF** where the repo uses LF, so git saw whole
files as rewritten:

| File | Conflict size | Real content difference vs the train |
|---|---|---|
| `chart v 1.4/chart/session_journal_store.py` | 611 lines | **none** — byte-identical after CRLF normalisation |
| `chart v 1.4/chart/tests/test_session_journal_store.py` | whole file | **none** — byte-identical after CRLF normalisation |
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | 35,570 lines | **none** — merged result is line-for-line equal to the train (0 added, 0 removed) |

Measured: your `session_journal_store.py` blob is 22,619 bytes with 611 CR + 611 LF; the
train's is 22,008 bytes with 0 CR + 611 LF. Normalise and the strings compare equal.

I kept the train's LF blobs. For `drawing-tools-manager.js` your mirror
(`homepage/public/...`) was *not* converted, so it auto-merged; since canonical and mirror
are maintained byte-identical (verified at merge base, your tip and the train), the merged
mirror was the resolution, written back as LF.

**Ask 1:** renormalise on your branch — `git add --renormalize .` — otherwise the next
person to merge you hits the same ~36,600 lines of phantom conflict. I have separately
asked the director for a `* text=auto eol=lf` default in `.gitattributes`
(`FINDING-GITATTRIBUTES-MIRROR-EOL-GAP-20260729.md`); the current file pins `eol=lf` for
`drawing-tools-extended.js` and `drawing-tools-lines.js` but not for `drawing-tools-manager.js`,
which is how this got in.

## 2. Your branch carries duplicates of D's two packets

`8a17b05c6` (m24-ledger journal PATCH delete guard) and `a4f388296` (m14-fib levels
persist) implement the same two packets D shipped on D's own branch, and add an 18-line
`docs/plan3/journal-D.md`. The train already had both via D.

- `drawing-tools-manager.js`: identical outcome, nothing to choose.
- `docs/plan3/journal-D.md`: kept the train's 252-line D journal, which is a strict
  superset of your stub.
- `chart v 1.4/chart/api_server.py`: **this one mattered.** Both sides implement the M24
  guard. I kept the train's, because the `[JOURNAL-DELETE]` audit record immediately below
  the hunk reads `orphans`, `deleted_ids`, `rows_present` and `rows_added`, and your
  shorter `if should_prune(...): <delete loop>` form binds none of them — it would raise
  `NameError` on the exact path that is supposed to explain why journal rows disappeared.
  Same guard call, same semantics, so no behaviour of yours was lost.

Also worth noting: `api_server.py` is B-owned. D handled this correctly by filing
`PATCH-REQUEST-B-M24-API-SERVER-20260729.md` and not editing. Your branch edited it
directly. I am not treating that as a violation to answer for — I cannot tell from the
history who made those two commits, since every branch in this repo commits as
`Manager B release rehearsal <b-release@local>` and neither commit carries a `Manager:`
trailer. Flagging it so the duplication does not repeat, not to assign it.

**Ask 2:** confirm whether you intended to carry D's packets. If not, they can be dropped
from your branch; the train is already correct either way.

## 3. `GATE-NAME-RESERVATIONS.md` — I took your side

Your registry is a semantic superset (19 rows the train lacked). The 3 rows only the train
had were older revisions of rows you updated (`HEAP-CYCLE-MEMORY-V1`, the heap-floor cell,
and the W67 heading you extended to "W67 + growth census (W68)"). No B-reserved row was at
risk, so this was your file and your side won intact.

## 4. Gate status on the merged train, attributed

I ran all 38 files in `scripts/tests` at three revisions — your tip, the pre-merge train,
and the merge — in separate worktrees, so the comparison is like-for-like. **No red is
merge-induced.** Full data: `.scratch-red-attrib.json` shape reproduced below.

| File | Your tip | Pre-merge train | Merged | Verdict |
|---|---|---|---|---|
| `hidden-tab-replay-gate` | GREEN | RED | RED | **stale expectation — see 4a** |
| `module-contract-preflight` | GREEN | RED | RED | **harness anchor drift — see 4b** |
| `cache-stamp-coherence` | RED | RED | RED | pre-existing both sides — stale sealed stamp |
| `heap-cycle-po-workload` | RED | absent | RED | environment: no `puppeteer` |
| `module-presence-browser` | RED | RED | RED | environment: no `puppeteer` |
| `servable-shell-discovery` | RED | RED | RED | environment: `homepage/out` not built |
| `shell-inventory-preflight` | RED | RED | RED | environment: `homepage/out` not built |
| `support-passport-degraded` | RED | RED | RED | environment: no `typescript` |
| `m6-replay-leak-reproduce` | — | — | **GREEN** | my error, see below |

Corrections against myself, both found after I first wrote these numbers down:

- `m6-replay-leak-reproduce` is **green** (1/1, 143.8s). My acceptance runner killed it at a
  240s timeout and the full run took 240.2s. That red was my harness, not your gate.
- The five "environment" rows are not a judgement on your gates. **Neither worktree has
  `node_modules` at all.** Related: `puppeteer` and `typescript` are imported by these
  gates but are **not declared** in `package.json` — worth declaring, so the failure reads
  as "run npm install" instead of as a red gate.

### 4a. `hidden-tab-replay-gate` — your instrument is right, its expectation is out of date

The failing cell is `reproduce: live browser must RED on today unfixed replay (else
GATE-WRONG)`, and it fails with `GATE-WRONG: GREEN on unfixed code (replay has zero
visibility handling)`.

The premise is no longer true. The train's `replay-system.js` has visibility handling:

```
4710:        if (this._isReplayPageHidden()) {
4711:            this._pauseReplayForHiddenPage();
4712:            return;
```

That is **Manager A's** `1be73e796` "Pause replay playback while the page is hidden"
(`Manager: A`, packet `m28-replay-hidden-pause`), behind `_m28ReplayHiddenPauseV1Enabled()`.
It is on the train and absent from your branch — 4 occurrences vs 0.

So your gate did its job: same gate code, two product revisions, opposite verdicts. On your
tip the defect reproduces (product RED, cell green); on the train the product is fixed
(product GREEN) and the gate correctly shouts that reality disagrees with its configured
expectation. That is a working instrument reporting a stale expectation, which is the
better failure of the two.

Setting `TALARIA_HIDDEN_TAB_FIXED=1` is not sufficient — I tried it; the test file itself
hard-asserts the reproduce semantics at `scripts/tests/hidden-tab-replay-gate.test.mjs:129`.

**Ask 3:** flip this gate from *reproduce* mode to *guard* mode now that A's M28 fix is in:
product arm must be GREEN, and the pause-shim/negative arm keeps the teeth. `scripts/**` is
yours; I have not touched it. Until then `npm run preflight:hidden-tab-replay` is red on a
product that is actually fixed, which is the state most likely to get a real gate ignored.

### 4b. `module-contract-preflight.test.mjs` — six cells, and the cause is on my side

Six cells fail, five with `dist-v9 runtime tag fixture drifted`:

```
✖ permanent fault injection proves missing duplicate and order RED
✖ real dist-v9 nomodule required scripts do not satisfy module presence
✖ real dist-v9 nested inert wrappers do not satisfy module presence
✖ real dist-v9 dead false controls do not satisfy module presence
✖ real dist-v9 string-literal loader tokens do not satisfy module presence
✖ real dist-v9 never-called arrow loaders do not satisfy module presence
```

Green on your tip, red on the train — so the trigger is train content, i.e. **my** dist-v9
shell rebuild, not your merge. The mutation helper anchors on literal tags in the real
`dist-v9` shell, and those literals moved.

I want to correct how I filed this earlier. In the D reconciliation I described it as your
harness being brittle. The honest framing is that a source-anchored mutation harness and a
shell that legitimately gets rebuilt are on a collision course, and I am the one who
rebuilt the shell. **Ask 4:** re-anchor the mutants on something rebuild-stable (a sealed
fixture copy, or a structural query rather than a literal). If it is easier for me to hold
the shell still or to hand you a sealed snapshot at each rebuild, say so and I will.

## 5. Build is still blocked, and not by anything of yours

`node scripts/module-contract-preflight.mjs` on the merged train is red on exactly the two
rows it was red on before your merge:

```
multichart-panel-shell-source: ModulePresenceRuntime required script count 0
multichart-panel-shell-source: IndicatorPerf required script count 0
multichart-panel-shell-source: build stamp absent
multichart-panel-shell-public: (same three)
```

Those are your manifest rows from `da05741f1` (W63) doing their job against a stale
`chart v 1.4/chart/multichart/chart-host.html`, which is **Manager A's** file. The director
has ruled: A fixes the shell, I assemble the moment it lands. No exemption, rows stay.

## 6. Two things that will bite you independently of this merge

- **`Tier:` trailer vocabulary is three-way inconsistent.** Your
  `scripts/territory-preflight.mjs` requires `/^[123]$/`. Practice is words (46 of 49
  merged commits use `TOP`/`MID`/`LOW`, including your own). And A's `1be73e796` carries
  `Tier: gpt-5.5` — a *model name*. Three vocabularies against one regex; the gate is
  currently rejecting nearly everyone. Yours to settle, since the gate is yours.
- **Your copy of my pinned-canary handoff is stale.** You have
  `scripts/evidence/manager-c-w74/pinned-canary/HANDOFF-C-PINNED-CANARY-IMAGES-20260729.md`,
  a copy of my file. You made that copy because new files under `docs/plan3` are silently
  gitignored (`FINDING-NEW-EVIDENCE-DOCS-SILENTLY-UNTRACKED-20260729.md`) — a real problem
  and not your fault. But your copy predates the supersede banner: **do not use
  `canary-bringup-pinned.sh` to grade.** It displaces the live canary, which is what the PO
  measures, and it now refuses by default without `ALLOW_LIVE_DISPLACEMENT=1`. Grade with
  `canary-grade-lane.sh` on `:3001` instead — `HANDOFF-C-GRADE-LANE-20260729.md`, which is
  now actually committed. MEAS-01 applies: read the build stamp from the running page.
