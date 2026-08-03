# PROPOSAL — make cited evidence citable, without dragging in the transient noise

**To:** Director · **From:** B · **Raised:** 03-08 23:2x+01:00
**Requested at 22:47+01:00.** Two questions were asked: the narrowest change, and how many live
citations currently point at ignored paths. Both answered below, measured rather than estimated.

`.gitignore` is not in my territory and I have **not** changed it. The patch was applied, measured, and
reverted byte-for-byte (`b6cc50772cbac613` before and after).

---

## The answer to the count question

Scanned all **528 tracked `.md` files** under `docs/plan3` for references to paths under the four
evidence roots.

| | count |
|---|---|
| distinct evidence paths cited | **177** |
| of those, **not in git at all** | **77** (89 separate citation references) |
| of the 77, **gitignored** — the gitignore's doing | **65** |
| of the 77, merely never `git add`ed — not the gitignore's doing | 12 |

So: **65 live citations point at ignored paths.** That is the number asked for. The 12 is worth
separating out, because fixing the ignore rule will not help them and they need a different nudge.

### The 65 are not one problem, they are four, and only one is a gitignore problem

| | count | fixable by an ignore change? |
|---|---|---|
| exists on disk, is a `.json`/`.jsonl` file | **22** | **yes** |
| exists, some other extension | **0** | n/a |
| citation points at a **directory**, not a file | 2 | no — the citation is imprecise, not the ignore |
| **absent even locally** — no copy exists anywhere | **38** | **no. Nothing can recover these.** |
| exists but is a 150 MB+ heapsnapshot | 3 | no, and deliberately so |

**The dominant failure is not the gitignore.** 38 of 65 cite artifacts that exist on **no** disk in the
project. Those citations were unverifiable the moment they were written, and by anyone — including their
author. An ignore rule change fixes 22. The other 38 are a harder finding and I am reporting it rather
than burying it in a patch: **more than half of the dangling citations were never backed by a retained
artifact at all.** Examples, each cited twice from tracked prose:

```
_evidence/manager-C/N1-HEAVY-VS-FRESH.json
_evidence/manager-D/D1-J1-SETTLE-BROWSER-20260731.json
_evidence/manager-D/EXCURSION-SINGLE-OWNER-V1-CONF02-BYTES-20260730.json
_evidence/manager-D/RELEASE-PARITY-NON-CONTAMINATION-CYCLE2-20260731.json
```

### Where the damage sits

| root | cited | tracked | dangling |
|---|---|---|---|
| `_evidence/` | 74 | 23 | **51** |
| `docs/plan3/evidence/` | 97 | 71 | **26** |
| `docs/plan3/worker-reports/` | 5 | 5 | 0 |
| `docs/plan3/baselines/` | 1 | 1 | 0 |

`_evidence/` is the worse half, and it is ignored by a single line (`.gitignore:151`) with no negations
under it at all.

---

## Why the current rule is not protecting anything

The ignore is not keeping these artifacts out of git. It is only making it **a coin flip** which ones
landed, because lanes force-add whatever they remember to:

| root | files on disk | already tracked |
|---|---|---|
| `docs/plan3/evidence/` | 565 | **295** |
| `_evidence/` | 198 | **83** |

378 files are already in git *through* a rule that nominally excludes them. The rule's only live effect
is that the other half is invisible, unpredictably.

### The noise is exactly one file extension

`_evidence/` is **1,900.8 MB**, of which **1,895.1 MB — 99.7% — is 12 `.heapsnapshot` files**, none
tracked. Everything else in both roots is small:

| | files | size | largest |
|---|---|---|---|
| `.json` across both roots | 433 | 14.1 MB | **nothing over 1 MB** |
| `.heapsnapshot` | 12 | 1,895.1 MB | 324.9 MB |

The heaviest thing *already tracked* under `docs/plan3/evidence/` is a pair of `.json.gz` CPU traces at
15.8 MB — more than all 433 JSON artifacts combined. So the repo already carries heavier evidence than
this proposal adds.

---

## The proposed change, narrowest form

Two edits. Everything not named stays exactly as it is.

**1. In the `docs/plan3` block (after `docs/plan3/*`, near line 131):**

```gitignore
# INSTRUMENT-01: a citation whose evidence is not in git is unverifiable by anyone but
# its author. Machine-readable artifacts under the evidence roots become citable; the
# heap snapshots that make these directories heavy stay out by extension, not by hope.
!docs/plan3/evidence/
!docs/plan3/evidence/**/*.json
!docs/plan3/baselines/
!docs/plan3/baselines/*.json
*.heapsnapshot
```

**2. Replace `.gitignore:151`, `_evidence/`, with:**

```gitignore
_evidence/**
!_evidence/**/
!_evidence/**/*.json
```

The second edit is the one that needs explaining. `_evidence/` with a trailing slash makes git refuse to
**descend** into the directory, so a negation underneath it can never fire — un-ignoring `*.json` inside
it is silently a no-op until the directory-ignore becomes a contents-ignore. That is the awkward detail,
and it is why this could not be a one-line change.

`.md` under the evidence roots is deliberately **not** negated: 0 of the 65 dangling citations need it.
`probes/` and `worker-reports/` are deliberately untouched: 0 dangling citations point at either.

### Measured, not assumed

Applied the patch, ran `git check-ignore` over every file under all four roots, reverted:

```
.json under the evidence roots                  454
  ignored before the patch                      307
  ignored after  the patch                       18      (the 18 probes JSON, correctly)
  => newly committable                          289      (11.1 MB)

heapsnapshots on disk                            12      (1.85 GB)
  ignored after                            12 of 12      <-- unchanged
docs/plan3/probes files                          23
  still ignored after                      23 of 23      <-- unchanged

VERDICT: the patch does what it claims
.gitignore restored: b6cc50772cbac613 -> b6cc50772cbac613  IDENTICAL
```

**Cost:** 289 files, 11.1 MB, none over 1 MB. **Cannot** pull in a heapsnapshot — not by size heuristic,
which git has no way to express, but because no `.heapsnapshot` matches `*.json`, plus an explicit
`*.heapsnapshot` line as the second lock.

---

## What this does not fix, stated plainly

- **38 citations stay dangling** and no ignore rule can change that. The artifact does not exist.
- **2 citations point at directories** rather than files; they need rewording by their authors.
- **3 point at heapsnapshots** and should be replaced by citations to the derived JSON summary.
- It does not make evidence *appear* — it only makes it **possible** to commit. Lanes still have to
  commit it, and nothing yet fails when they do not. A follow-on gate that reds a commit whose prose
  cites an untracked path is the obvious next control, and is not in this proposal.

## One dependency worth flagging

`open_rulings: SH-1` in `TERRITORY.yml` already asks *"are `docs/plan3/evidence`, `worker-reports` and
`probes` shared across all managers?"*, default in force *"shared for all three"*. If they are shared,
this proposal is uncontroversial. If evidence turns out to be per-manager territory, then tracking it
changes who can commit into whose evidence directory, and SH-1 should be ruled first.
