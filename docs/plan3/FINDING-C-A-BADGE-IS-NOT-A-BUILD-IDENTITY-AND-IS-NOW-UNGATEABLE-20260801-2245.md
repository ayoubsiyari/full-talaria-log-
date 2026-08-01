# A badge is not a build identity, and it is now impossible to gate on one

**Manager C — 2026-08-01 22:45 (UTC+1)**
Enforcement of the 22:00 ruling. Everything below is exercised against the live origin, not asserted.

## The fact

`http://31.97.192.82:3000` served buildId `20260802b121` under **two different source trees on the same
day**, seven hours apart:

| read at | badge | source commit |
|---|---|---|
| 14:50 | `20260802b121` | `a17e00e8854fa7644c18269cd538daba247e7051` |
| 21:25 | `20260802b121` | `c0585e6813aaf61f421495fd839b706431c17632` |

The badge did not move. The tree underneath it did. Anything keyed on the badge would call these one
build, and would carry a test result across a tree it never saw.

## What now enforces it

**The gates are the digest and the source commit SHA.** The digest says what the bytes are; the SHA says
which tree made them. Neither implies the other, and the badge is recorded for human reading only.

1. **`--expectBadge` is refused by name** (exit 2). The rule is executable rather than advisory — there is
   no way to express "pin this run to a badge."

2. **The smoke transfer gate.** A real firing re-reads the origin and refuses (exit 5) unless the digest
   *and* the source commit both still match the build the smoke passed on. A SHA that moved after a green
   smoke is a new build and **the smoke does not transfer**.

3. **`--expectSha` is bound.** It existed in the soak and *nothing had ever passed it*, so a run pinned
   whatever SHA happened to be live at boot rather than the one the smoke validated. Present but unbound —
   the defect class my mutants exist to catch, found in my own launcher.

4. **Mid-run drift already stopped the run** (PASSPORT-3, per sample). The new work is the pre-fire half:
   until tonight the seal could move between the smoke and the launch with nothing watching.

5. **`build-identity-watch`** records every badge/digest/SHA transition and flags re-cuts under an
   unchanged badge. The b121 re-cut was caught only because I happened to read the passport twice; that
   should not depend on happening to look.

## One digest implementation, not three

The path list and hash now live in `lib/seal.mjs` and every consumer imports them. Two copies had already
produced two digests for one build and it read like a seal break; the launcher's new gate would have been
a third. Verified: `lib/seal.mjs` and `build-passport.mjs` agree on `3de605fbd5c73dda1b0ff59f81cb4176`.

## Proof, and a defect it found in my own test

`smoke-transfer-selftest` **9/9** against the live origin — every refusal driven, including the ruling
itself (a moved SHA refused at exit 5), and no synthetic smoke grade left behind.

Mutants **8/8 caught**, all files restored, self-test 24/24 green. Two are new:

- **M7** — check the digest, let the SHA slide. **CAUGHT.**
- **M8** — compute `--expectSha` and never pass it. **MISSED on the first run.**

M8 is the finding. My success-path check matched the SHA anywhere in stdout, and the gate *prints* the SHA
whether or not the flag ever reaches the child — so a dropped `--expectSha` passed a green test. It now
asserts against the child's command line. **A test that reads the narration instead of the binding is
vacuous**, and I have published on that shape before; the mutant is why it did not survive to the soak.

## What this does not cover

The gate compares the smoke's build to the build live *at launch*. A re-cut **during** the ten hours is
caught by the per-sample check, which voids and stops the run — deliberate, but it means one rebuild at
hour eight destroys ten hours. That risk is B's to hold, and B has been told.
