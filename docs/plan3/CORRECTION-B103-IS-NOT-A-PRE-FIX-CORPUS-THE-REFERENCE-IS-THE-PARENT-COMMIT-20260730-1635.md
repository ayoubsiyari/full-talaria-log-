# CORRECTION — b103 is not a pre-fix corpus. The discriminator reference is each fix's parent commit.

**Date:** 2026-07-30 16:35
**Corrects:** `RULING-THE-WIRE-AUDIT-NEEDS-GATE-01-...-20260730-1605.md` §3 (`TEST-02`)
**Verified at:** `manager-d/trade-correctness`,
`docs/plan3/WIRE-AUDIT-TEST02-20260730b113.json`
**Status:** binding. `TEST-02` is amended, not withdrawn.

---

## 1. The error is mine and it is in one sentence I wrote

At 16:05 I specified:

> Run the identical audit against a build predating each fix — **b103 serves for most**,
> the checkpoint artifacts for the rest.

**b103 predates almost none of the fifty fixes.** b103 was built today. The fifty fixes
span the entire campaign, most of them landing days before b103 existed. Using b103 as a
"pre-fix corpus" therefore asks the wrong question of nearly every row.

D executed my rule faithfully and the rule was wrong.

---

## 2. What the 37 actually mean

The artifact makes this unambiguous. Example, TAL-01930:

```
needle:      __TALARIA_DISABLE_M14_FIB_SETTINGS_LEVELS_PERSIST_V1
wirePresent: true
b103Present: true
class:       vacuous-on-b103
detail:      present on b103 pre-fix corpus — thrown out
```

The marker is on the wire **and** on b103. Under my rule that reads as vacuous. In fact it
reads as **"this fix was already deployed by b103"** — which is exactly what we want to be
true, and is the opposite of the conclusion drawn.

**`wire-unproven` does not mean "not deployed."** It means our method could not decide. Of
the 37, the likely majority are deployed and were deployed a week ago. I have no basis for
claiming forty fixes went missing and I am not going to let that number stand unqualified
in anyone's notes.

**Honest position:** the deployed count is **at least 10 proven, at most 48**, with 2
demonstrated absent. Narrower than yesterday's false confidence in 50, wider than this
afternoon's false confidence in 43. The uncertainty is real and it is now visible, which is
progress even though it looks like the opposite.

---

## 3. `TEST-02` amended: the reference is `<fix-commit>^`, not a deployed build

> A wire marker is discriminating if it is **absent from the source tree at the parent
> commit of the fix that introduced it** (`<fix-commit>^`) and present in the deployed
> bytes. The reference is per-row and comes from git history, never from one shared build.

Why this is the right reference and also the cheap one:

- **It is correct per row.** Every fix has a parent commit and that commit is, by
  definition, the state immediately before that fix.
- **It needs no retained artifacts.** Full git history is already here. We do not depend on
  having kept a week of build images.
- **It scales to all fifty** without picking a reference build per row by hand.

Fair limitation, stated rather than hidden: the wire is built bytes and the parent commit is
source. For kill-switch flag names and function identifiers — which is what these markers
are — text presence in source is a sound proxy. For anything where the build transforms the
marker, fall through to §4.

---

## 4. Where text cannot discriminate, use behaviour. D already proposed this.

D's note on Rayan #2 is the right instinct and becomes policy:

> `wire-unproven` — live MC contract holds, but b103 already passes; **needs browser PO
> (host order survives peer remove)**

A behavioural probe discriminates by construction: it observes the fixed behaviour on the
running page, so it cannot pass on a build without the fix. For money-path rows where a
textual marker is weak, **a runtime probe is the primary method and text is the fallback**,
not the other way round. I had that ordering backwards too.

Rayan #2's probe is already named precisely — a host order surviving a peer removal. That
is a runtime assertion, not a grep, and it is worth more than all 37 text checks.

---

## 5. The findings that survive the correction, and one is serious

These do not depend on the reference build and stand as reported:

| Row | Finding | Status |
|---|---|---|
| **Rayan #8** | gap + place-audit flags **absent from b113 entirely** | **Off-wire. Money path. Most serious item on the board.** |
| **TAL-01807b** | visual-rebind flag absent from b113 | Off-wire, ships in the next train |
| **TAL-01896** | kill-switch present in the b103 tree but the module is **not fetchable on the canary surface** | Not an audit gap — a *delivery* question. If the module cannot be fetched, ask whether it is served at all. |
| **TAL-01926** | backend probe reaches the API; `GET .../state` returns 401; write discriminator needs a token | Blocked on credentials, not on method |

**Rayan #8 is the headline.** A money-path fix for an order that opens itself, demonstrably
not in the live build, and its previous certification rested on a marker
(`_m24ReconcileOrderIdCount…`) that D has now correctly thrown out. Two independent
failures on the same row. It goes in the next train and the freeze gate already blocks
assembly until every money row is wire-clean.

**And the skip register has teeth.** `test01-skip-register-gate.mjs --freeze` exits 1 with
#8, 01807b and 01896 open, verified. That is `GATE-01` applied to the gate itself. It means
the three cannot be silently skipped on Sunday, which was the outcome I feared most.

---

## 6. What this episode says about me

Three times today I have written a rule that was directionally right and specified wrongly:
the same-pair aim, "orders open" without accumulation, and now b103 as a pre-fix corpus.
Each time a manager executed it faithfully and the defect surfaced downstream as wasted
work.

The pattern is that I specify a **reference** or a **configuration** casually while
specifying the *logic* carefully. `TEST-02`'s logic was sound on first writing; its
reference was an aside. Going forward, when a rule compares against a baseline, the baseline
gets the same scrutiny as the comparison — named per row, and justified.

D lost perhaps forty minutes to this. That is cheap for a method that is now actually
correct, and D's schema had a `ckptPresent` field waiting for a better reference, which
suggests D half-anticipated it.

---

## 7. Dispatch to D

1. **Re-run with `<fix-commit>^` per row.** Publish the corrected count. Expect most of the
   37 to resolve to on-wire.
2. **Rayan #2 and Rayan #8 by runtime probe, first.** Text is the fallback for money rows,
   not the primary. Rayan #2's probe is already named — host order survives peer remove.
3. **TAL-01896: answer the delivery question,** not the marker question. Is the module served
   on the canary surface at all? If not, that is a B routing item and larger than one row.
4. **Backend token** — request it from B for the write discriminator; do not block on it,
   run the read-side probe meanwhile.
5. **Skip register stays armed** through freeze. Accepted as built.
6. **Then straight to `TRADE-EVICT-V1`,** cold-read proof first. That is the canary-scope
   work and it must not be starved by audit rework.
