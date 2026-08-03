# B → A · Section 2 of the seal packet is closed and ready to paste

**Handed 2026-08-04 02:1x+01:00 / 2026-08-04T01:1xZ. Owner B. Commit `d045e4d94`.**

---

## What you are getting

`docs/plan3/SUSPECT-LEDGER-SEAL.md` now satisfies the law the PO ruled at 23:33+01:00: every named
thing carries **exactly one** of KILLED / CLEARED / DEFERRED, and nothing is absent.

**Verify it yourself in one command rather than reading 524 lines:**

```
node scripts/suspect-ledger-census.mjs     # exits 0 = CENSUS_CLEAN
npm run test:suspect-ledger-census         # 12/12
```

Artifact: `docs/plan3/evidence/suspect-ledger-census-20260804.json`. Instrument committed at
`702060cb4` before any number from it was quoted, per INSTRUMENT-01.

| | before | after |
| --- | --- | --- |
| population — 149 ticket rows + 16 curated controls | 165 | 165 |
| STATED under exactly one state | **2** | **165** |
| `ILLEGAL_OPEN` | **5** | **0** |
| `AMBIGUOUS_MULTI_STATE` | 0 | **0** |
| `ABSENT` — the forbidden state | **158** | **0** |
| DEFERRED rows citing a seat that does not exist | **8** | **0** |

**`OPEN` is abolished.** It was legal in every earlier revision and five rows carried it.

---

## The three things you should quote, and the one you should not

**Quote this:** the suspect ledger had never been a census. It stated **7** of the ticket ledger's
**149** rows. Closing it is the work; the number is the finding.

**Quote this:** `fixed` is a status word, not four axes. All **49** `fixed` rows carry a commit and a
GREEN gate — three axes evidenced — and exactly **1 of 149** records a kill-switch anywhere, so **48 of
49** KILLED rows say `switch UNRECORDED`. Alongside C's `PSL-17` (eleven of fourteen roster switches
absent from the served build), "there is a switch" is the weakest of the four axes across the campaign.

**Quote this:** D's lane submission beat the ticket ledger's status column on **three** rows.
TAL-01696, TAL-01698 and TAL-01865 read `po-eyes`/`owner-blocked` while D had landed fixes with gates
and **served mutants killed on b126**. D's kill shape — mutants killed against the served build — is the
strongest in the file, and it is worth saying so in the packet.

**Do not quote `0 ABSENT` as "nothing is missing".** It means *zero absent of the 165 enumerated*. The
enumeration is a floor: id-shaped extraction cannot see a suspect named only in prose, living only in an
untracked file, referred to by two names, or existing only in a commit message. **The instrument can
prove an absence; it cannot prove completeness.** The file says this in its own voice in §0 and I would
rather you repeat the caveat than the headline.

---

## Two items the PO needs to see tonight, not post-soak

### 1 · Three of the PO's ten named items have no locatable referent

`PSL-30`. I searched and found nothing, and I have not invented verdicts.

- **"the unlit dark rooms"** — the word *dark* appears **nowhere** in tracked `docs/plan3`. Candidates
  that fit the metaphor are all separately seated: 14 gates that never ran, 11 of 14 switches absent
  from the build, 189 CRITICAL swallowed catches, `DRIFT-ABBA` reported complete having never run.
- **"the second GPU box"** — no request for a second machine exists in the corpus. GPU appears only as
  GPU-*private memory* in A's competitor bands, and that whole series is withdrawn (`PSL-01`).
- **"R7's machine-coverage backfill"** — `R7` resolves to two unrelated things, your ephemeral-discovery
  gate in the M20-Q6 capture reuse and M21-2 R7 the review round. Neither is a machine-coverage backfill.

They are DEFERRED because absence is forbidden, **explicitly not because deferral is the evidenced
answer.** That seat holds a question, not work. **I cannot rule on the seal-corrupting status of a
finding I never located**, which is why this is in the handoff rather than filed quietly — if any of the
three is a product defect in the sealed bytes, it belongs with the PO before the soak starts.

### 2 · TAL-01891 is the one row I marked seal-corrupting `unsure`

`PSL-21`. The only row in the ticket ledger marked `broken`: a real decoded chart screenshot measures
**20.7 MB**, and heavy account scale can plausibly reach multi-GB. Owner A — **yours.**

Everything else in the post-soak ledger is `no`. This one is `unsure` and stays that way: it is a live
P0 memory candidate in product code inside the sealed bytes. Its own ticket says *"fresh harness
accounts are not representative"*, so **a quiet soak is not evidence against it** and must not be quoted
as such.

**Do not let §1's cleared decoded-image row be read as clearing this.** That row disproved a *per-closed-
trade coefficient* — ~16.6 MB/closed-trade, which failed the matched-bars test and was bar-driven growth
wearing a trade label. The *absolute* 20.7 MB decode is a different claim and was never disproved.

---

## Sections you may need to reference

| section | what is in it |
| --- | --- |
| **§0** | the census, its method, the four-axis disclosure, and the floor caveat |
| §1–§3 | the original kill roster, bootstrap rows, and the four deliberate PROC-3 canaries |
| §4 | the five formerly-`OPEN` rows, restated with their former status kept visible |
| §4b–§4c | the sibling-wrapper deferral, and the viewport consumer withdrawn from deferral and killed |
| §4d | E's 7 rows |
| §4e | C's 31 rows — 18 KILLED, 5 CLEARED, 8 DEFERRED |
| §4f | D's rows, integrated from `D-SUSPECT-LEDGER-ROWS-20260803.md` |
| **§4g** | all 149 ticket rows, **generated** from the ticket ledger with the mapping rule stated |
| **§4h** | the 6 rows that refuse mechanical mapping, stated individually |
| **§4i** | the PO's ten named items and six B-lane controls |
| §5 | the seal gate, rewritten to require the census to exit 0 |

**§4g is generated, not transcribed** — 149 rows typed by hand is 149 chances to move a status word. If
the ticket ledger changes, regenerate rather than edit.

---

## What I did not do

- **I did not sign anything.** Every DEFERRED row's PO signature cell is deliberately empty for packet
  review. An empty cell tonight is the expected state, not an omission.
- **I did not touch product code**, and no row here implies a product edit.
- **I did not resolve TAL-01891, `SHELL-PLAY-01`, or the m20Q6 CPU-freeze half.** All three are seated
  with owners.
- **I did not clear m20Q6 outright.** Only the V8 half is answered — 416 bytes, measured independently
  by D and E against a precommitted 2 MB threshold. The CPU-freeze half is its own seat, because
  clearing a cross-domain suspect on one domain's evidence is `C-SUS-14` cross-basis borrowing in a
  fourth costume.
- **I did not claim the drawings feature is unverified.** D's served mutant kill on b126 verifies
  market-time drawing persistence. What is unverified is **my** `DRAW-SMOKE-01` grader, which is 13/13 as
  a pure function and has never executed against a build — making it one of the 14 gates in `PSL-04`
  that have never run. Two claims, one feature; the packet should say the stronger one.

---

## One note on the instrument, because it is the honest part

It had **four** defects and I found all four by running it.

Its first run printed nothing and exited **0** — the `invokedDirectly` guard compared `import.meta.url`
against a hand-built `` `file://${argv[1]}` ``, which never matches on Windows, so `main()` never ran. **A
green from an instrument that scanned nothing** is exactly what caught `copy-absence-census`
manufacturing a zero, and it happened again while building the tool to check for it.

Then, against the assembled file: a `` `OPEN` `` in a *was* column read as a live assertion; a DEFERRED
row explaining *"this cannot be KILLED"* graded itself KILLED off its own prose; and nine rows stated a
few lines away reported ABSENT because their ids match no shape. **Every one would have produced a false
accusation rather than a missed row** — which is the more dangerous direction for an instrument whose
whole job is to accuse.

All four are fixed with discriminating cells, and all four are recorded in §0 rather than quietly
corrected, because a census that hides its own failures is the thing it was built to prevent.
