# Review — B on D's LIFE-4 / M8 hydration guard

**Manager B — 2026-08-01 10:30 — in execution of RULING-KILL-ROSTER-ROUND-ONE §1 (LIFE-4: D builds, B reviews) and §6 (money-path rows walk)**

**Verdict: CHANGES REQUESTED.** The guard's logic is correct and fails closed in the right direction.
What it does not have is verification. One reachable hole, one dead admit-list entry, and a gate that
cannot fail when the guard is deleted.

**Reviewed:** `manager-d-trade` @ `manager-d/trade-correctness`, commit `dd0dc4445`, working tree as of
2026-08-01 09:50 (D has uncommitted LAG-1a edits in the same files; both mirrors re-verified against the
working tree, not against the commit).

---

## 1 · What I checked, and what I did not take on trust

| Claim | How I checked it | Result |
|---|---|---|
| Both mirrors identical | `git hash-object` on `chart.js` and `order-manager.js`, run against the working tree today, not D's commit | **AGREE** — D mirrored the uncommitted LAG-1a edits too |
| `GET /state` always carries completeness metadata | Read the whole route. One `return`, and `apply_journal_page_to_state_for_response` is unconditionally before it | **Holds** |
| Partial/slim hydrate cannot get durable authority | Extracted the shipped `journalVouchedFor` expression and executed it | **Holds** for every provenance value I could construct except one — see §2.1 |
| Absent metadata is not read as "complete" | `state.journal_complete === true` makes `undefined` falsey | **Holds** — safe direction |
| D's own gates pass | Ran `m8-state-bound-guard.mjs` and `m8-state-bound-invariant.test.mjs` | 4/4 green, and that is the problem — see §3 |

---

## 2 · Findings

### 2.1 A null session id on both sides grants full delete authority — BLOCKING until reachability is answered

The admit-list is:

```js
const journalVouchedFor = this._journalProvenance === 'locally-authored'
    || (this._journalProvenance === 'hydrated'
        && this._journalProvenanceSession === (sessionId != null ? String(sessionId) : null));
```

`_journalProvenanceSession` is set to `null` whenever `getActiveTradingSessionId()` returns null or
throws at hydrate time. `sessionId` normalises to `null` at write time under the same conditions. So
`null === null` is true and the write is vouched. A hydrate that could not determine which session it
belonged to vouches for a durable write that also could not determine one — "we do not know" resolving
to full authority, which is the exact inversion the surrounding comment says must never happen.

My behavioural gate is RED on this and only this:

```
FAIL  null-session hydrate does NOT grant delete authority
        got  true    want false
```

**I am not claiming this is reachable in production.** I could not establish whether live (non-backtest)
trading runs with a null session id, in which case this path is exercised constantly and the guard is
simply inert there, or whether it is unreachable and the finding is theoretical. **That question is D's
to answer, and it is the one thing blocking sign-off.** If it is unreachable, say why and I will clear
it. If it is reachable, the fix is one clause: require a non-null session on both sides.

### 2.2 `locally-authored` is admitted by the allow-list and assigned by nothing — non-blocking, fix now

Zero assignments anywhere in `order-manager.js`. The value is declared in the provenance type comment,
admitted at the top of the durable allow-list, and set by no code path. Today that is dead and
therefore harmless: the guard is stricter than documented.

It is worth removing anyway, because D's invariant test contains
`assert.match(durableAllowlist, /locally-authored/)` — the gate *requires the dead entry to stay*. The
combination is a loaded gun. The day any code sets that value, delete authority is granted with no
hydrate having happened, and the test that should have caught it is the test that mandated the entry.

Either delete the clause, or implement `locally-authored` properly and gate it behaviourally. Do not
leave an admitted value that nothing can set.

### 2.3 The guard has a kill-switch; the roster says it does not

The roster row reads "(no switch; guard is the fix)". The shipped guard is wrapped in
`_bW16HydrationGuardEnabled()`, disabled by `__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1`. Inherited from
B-W16, so not something D introduced.

This is a discrepancy between the ruling and the tree, not a defect — and the switch itself is well
built, defaulting ON and treating an absent `window` as ON. But a documented "no switch" row that has a
live switch capable of turning off trade-deletion protection should be reconciled deliberately rather
than discovered during an incident. Director's call: either amend the row to name the switch, or D
removes it.

### 2.4 Version skew has no recovery path — record it, do not block on it

A new client against a server that does not send the metadata sees `journal_complete === undefined`,
labels every hydrate `partial-hydrate`, and suppresses durable writes for the whole session, with no
path back because `locally-authored` is dead. That direction is the safe one — no deletion — but the
failure is silent and total.

Same-version deploys make this hard to reach, and now that LIFE-3 puts `no-store` on the chart document
the shell and the server move together more tightly than before. I would not hold the row for it. I
would distinguish "the server said incomplete" from "the server said nothing", so that a skew is
visible in the field instead of looking like 100% partial hydrates.

---

## 3 · The reason this row was right to require review

D's M8 gate asserts:

```js
for (const source of [orderSource, homepageOrderSource]) {
  assert.match(source, /partial-hydrate/);
}
```

That is a grep for the fix's own text. It passes if the entire guard is deleted and the phrase survives
in a comment. I mutated the allow-list to admit `partial-hydrate` — the precise defect this row exists
to prevent — and D's gate stays green, because the string is still in the file.

This is the self-written-marker failure the Director and I have both been chasing all week, and it is
worth naming plainly because D did nothing unusual: interrogating source text is the easy gate to write
and it looks like coverage. It is not. The gate must interrogate the behaviour.

**I have written the behavioural gate rather than bouncing the row back for one.** It extracts the two
real decision expressions out of the shipped source and executes them, so it is bound to the file that
ships: change the logic and it re-derives, delete the logic and it cannot find it and fails.

`_evidence/manager-B/life4-review/life4-behavioural.test.mjs` — 18 pass, 1 fail, the failure being §2.1.

It covers: complete/slim/partial reason selection, absent metadata, every provenance value including
unknown ones, session mismatch, the empty-but-server-has-trades trap at all four corners, and a
demonstration that D's regex gate misses the widened-allow-list mutant while this one catches it.

---

## 4 · What clears this row

1. **D answers §2.1** — is a null session id reachable at hydrate-and-write time? If yes, one clause.
2. **D removes the dead `locally-authored` clause**, or implements and gates it, and drops the
   `assert.match(durableAllowlist, /locally-authored/)` line that pins it.
3. **D adopts the behavioural gate** into its own test run so the row keeps its verification after I
   stop looking at it.
4. **Director reconciles §2.3** — the row says no switch and there is a switch.

Not required to clear the row, but stated so it is not forgotten: D's own verdict is
`IMPLEMENTED_PENDING_LIVE_MEASURE`, and the M1 rerun on the deployed build has not happened. That is a
memory measurement, not a correctness one, and it belongs to the wave rather than to this review.

**Review tier: full. Not downgraded. Not self-certified.**

---

## 5 · Host attribution

No performance numbers appear in this review; it is a correctness review, and every check above is a
static or behavioural assertion that is host-independent. Where I do publish numbers, per §2.3 of the
ruling they carry their host. My host is the canary, `31.97.192.82`, a **software rasteriser
(SwiftShader)** — not C's `ANGLE (NVIDIA, RTX 4060 Laptop GPU, Direct3D11)`. I have no route to C's
host; see my separate note on what that does to the "all wave measurement pins to C's host" rule.
