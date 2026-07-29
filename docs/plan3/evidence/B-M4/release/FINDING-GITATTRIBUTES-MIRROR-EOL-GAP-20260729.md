# FINDING — `.gitattributes` pins EOL for mirrored modules but omits the biggest one

**Raised by:** Manager B (release manager), 2026-07-29, during the C reconciliation
**File:** `.gitattributes` — **unowned** in `docs/plan3/TERRITORY.yml`
**Status:** NOT EDITED. Requesting a grant or a director edit, per the precedent set with
`homepage/nginx.local.conf` this evening: escalate, do not edit.

## What happened

Reconciling C's 17 commits into the train produced six conflicts. **Four of the six were
not real divergence.** They were line-ending rewrites:

| File | Conflict | Actual content difference |
|---|---|---|
| `chart v 1.4/chart/session_journal_store.py` | whole file (611 lines) | **none** — byte-identical once CRLF is normalised |
| `chart v 1.4/chart/tests/test_session_journal_store.py` | whole file | **none** — byte-identical once CRLF is normalised |
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | whole file (35,570 lines) | **none vs the train** — the M14 change it carries was already in the train via D |
| `docs/plan3/journal-D.md` | add/add | a stub of a journal the train already holds in full |

The measurement, not an impression: C's `session_journal_store.py` blob is 22,619 bytes
with 611 CR and 611 LF; the train's is 22,008 bytes with 0 CR and 611 LF. Normalise CRLF
and BOM and the two strings compare **equal**. Same for the test file. For
`drawing-tools-manager.js` the merged result is line-for-line equal to the train: zero
lines added, zero removed.

So roughly 36,600 lines of phantom conflict, in a money-path-adjacent file
(`api_server.py`'s journal sync partner) and in the largest mirrored drawing module, all
of it noise that a human or an agent has to read through to find the two real conflicts.

## Why the existing file did not prevent it

`.gitattributes` exists and its first line states the intent exactly:

```
# Mirrored checkpoint modules must have byte-identical blobs on every checkout.
**/chart/modules/drawing-tools-extended.js text eol=lf
**/chart/modules/drawing-tools-lines.js text eol=lf
**/chart/modules/replay-system.js text eol=lf whitespace=blank-at-eol,blank-at-eof,space-before-tab
```

It enumerates mirrored modules one by one. `drawing-tools-manager.js` — 17,824 lines, the
largest of the mirrored drawing modules and a sibling of two files that *are* listed — is
not on the list. Neither is anything under `chart v 1.4/chart/*.py`. `git check-attr -a`
returns nothing for either file, so nothing constrains how they are committed.

This is a gap in an existing control, not a missing control. The enumeration approach
means every new mirrored module has to be remembered, and this one was not.

## Requested change

A default, so the list stops being the thing that has to be complete:

```gitattributes
# Default: normalise text to LF in the index. Mirrored modules and Python
# helpers are compared as blobs across canonical/mirror pairs, so a CRLF
# checkin shows up as a whole-file rewrite and a whole-file merge conflict.
* text=auto eol=lf
```

Keep every existing line: the `whitespace=` settings on `replay-system.js` and the
`whitespace=cr-at-eol` on `scripts/checkpoint-provenance.mjs` carry meaning a default does
not express, and `checkpoint-provenance.mjs` deliberately wants CR at EOL — a blanket
`eol=lf` without that line still standing would fight it.

## What I did instead of waiting

The train's blobs are normalised back to LF as part of the merge resolution, so the train
itself is clean. **This does not fix the source branch.** C's branch still holds the CRLF
blobs, so:

- Anyone else merging C's branch will hit the same ~36,600-line phantom conflict.
- If C's branch takes further commits to those three files, the conflict regenerates.

The cheap remedy on C's side is one normalising commit
(`git add --renormalize .` with the attribute in place). That is C's branch, so it is C's
call; it is written up in `HANDOFF-C-RECONCILE-GATES-20260729.md`.

## What this finding does NOT claim

I cannot attribute the CRLF conversion to a person. Every branch in this repo commits
under the same identity (`Manager B release rehearsal <b-release@local>`), and the two
commits that introduced it carry no `Manager:` trailer — they predate the trailer
discipline the director accepted this evening. What is observable: the conversion arrived
in `8a17b05c6` and `a4f388296`, the two oldest commits on C's branch (12:57 and 12:58),
both of which implement **D's** packets (M24 journal-delete guard, M14 fib persist) and
write **D's** journal. Whose working copy produced them is not something the history can
tell me, and I am not going to guess at it in an evidence file.
