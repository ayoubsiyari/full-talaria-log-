# RULING — the train may stay assembled and stamped, but the PUSH holds on P6. A deleted served shell cannot be kill-switched, and under a single-push deployment that makes it unrevertable in the field. B and A must also reconcile P2/P3/P4 against the assembled tip, because they currently disagree.

**2026-07-28 20:12. B declared ship-ready at 20:07 (`20260728b81`, tip `f8a6c28a8`). A reported at 20:01 that four of six render items remain open. Both cannot be right.**

---

## 1. The disagreement, stated exactly

**B, journal B-0137:** *"Train render/lifecycle items each carry a runtime switch (B-W16/17, M26, M27, M28, R1 M23, R1 Q9)… **Not waiting on FIX 1.** Residuals P2/P3/P4 remain A's continuing work, not a hold."*

**A, same window:** *"the enumeration found **six** missing switches. R1 closed **P1** and **P5**. **Still open: P2, P3, P4, and P6.**"*

**B treats P2/P3/P4 as future work outside the train. A lists them as open items found by an enumeration of what is *in* the train.** **One of those readings is wrong and the assembled tip `f8a6c28a8` is the only authority that settles it — not A's branch, not B's.**

**Neither manager is at fault here.** B verified what I asked it to verify and did it properly. A enumerated as I asked and reported honestly. **They are working from different objects: A enumerated its own tip, B assembled B→C→A and inspected the result.**

## 2. P6 — this one holds the push, and A was right to escalate rather than flag it

**A found that the enumeration includes a *deleted served shell*: `homepage/public/chart/talaria-design/live/index.html`, removed in `d071c858f`.**

**A's words: it "cannot take a runtime switch at all — no file, nothing to flag — so it needs a Director decision."**

**A is correct, and this is the single most dangerous item in the train.**

**Why it outranks everything else in the train:** every other change is a behaviour change behind a flag, so a bad outcome is one flag-flip from reverted. **A deletion is not.** There is no runtime value that restores a file that is not in the image. **And under PO ruling D-5 we get one push.** So if that route has consumers, we break them and **cannot recover without a second push we have not budgeted.**

**Ruling: the push holds until the route is proven to have no consumers.** The train stays assembled and stamped — that work is good and should not be unwound.

**This should take minutes, not hours.** B's `live-surface-probe` and C's shell census already exist and between them can answer whether anything requests that path. **If nothing does, P6 clears and the push proceeds. If anything does, A restores the file and the deletion moves to a later train**, which is A's own second option and the correct one.

## 3. P2, P3, P4 — reconcile against the tip, not against each other

**Ordered: B and A jointly determine, on the assembled tip `f8a6c28a8`, whether the changes behind P2, P3 and P4 are present in the image.**

- **If present and unflagged, they block** — that is precisely the condition my 16:52 ruling exists to prevent, and precisely what B originally held the train for.
- **If absent from the tip, B is right, they are A's continuing work, and they do not hold anything.**

**Do not resolve this by discussion. Resolve it by inspecting the artifact.** One of the two of you is looking at a different object than the other, and only the artifact knows which.

## 4. Two standing rules promoted from A's R1 review — both earned

**FLAG-01 — a kill-switch must be testable against the ABSENT property, not only against explicit `false`.**

**A's finding:** *"Cells wrote the flag as explicit `false`; in production the property is ABSENT. An inverted-defaulting mutant therefore survived the entire suite while silently inverting both switches on the real page. Code was correct, coverage was not."*

**This is the most valuable thing produced today.** It means a flag can pass every test and behave backwards in production. **Every kill-switch packet from here must cell the absent-property default.** A has already added it to its brief template; it now binds all three managers.

**FLAG-02 — a kill-switch that cannot be flipped back without a page reload is not a kill-switch.**

**A's finding on Q9:** the flag read was correct per call, but *"the read itself permanently mutated the object graph"* — the wrapper self-uninstalled on first call under flag-on, and since `initReplaySystem()` runs once per load, **there was no way back without a reload.** A names it *"the M28 stranding defect in mirror image."*

**The reason this rises to a rule rather than a bug report is the near-miss attached to it:** after one flip cycle the corrupted instrument reported `fullResamplesPerTick = 2.000` against a truth of `1.000`, **and 2.000 is the value A's own journal records as the legitimate render-frame signature.** **A corrupted reading would have been indistinguishable from a published one.** We came close to publishing a measurement that was silently wrong in a plausible direction — which, given how much of today was spent arguing over measurements, is a hazard I want named permanently.

**Every switch must survive ON → OFF → observe, in-page, with no reload.**

## 5. What I am not doing

**Not unwinding the assembly.** B→C→A merged clean, the cache-stamp gate is GREEN, R1 kill-switches 11/0, provenance 15/0. **That is a good train and it should sit stamped while P6 is resolved.**

**Not treating B's ship-go as an error.** B was told to verify against its own enumeration and ship if clean. **It did, and it documented the evidence.** The gap is that neither of us knew A's enumeration had found a deletion that no flag can cover — **A discovered that six minutes before B declared ready, and nothing routed it to B.** That routing failure is mine.
