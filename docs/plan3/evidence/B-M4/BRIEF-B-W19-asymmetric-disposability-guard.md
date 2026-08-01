# BRIEF B-W19 — asymmetric disposability guard + SAFE-01 repositioning

**Approved by DISPATCH-BC-20260728-1520 §3. Two changes, one packet.** Work only in
`C:\Users\user\Desktop\talaria1\manager-b-plan3`.

---

## 0. The property that matters

**The harness must not be able to write to the real ledger because two adjacent
command-line flags were swapped.** Everything below serves that sentence. If your
implementation satisfies the letter of §2 and §3 but a transposition still reaches
the real ledger, you have not done the work.

## 1. The defect

`docs/plan3/evidence/B-M4/m4-ledger-invariants.mjs`:

- `:240` and `:258` — `String(opts.disposableSessionId) === String(opts.sessionId)`.
  **Symmetric.** It only catches the two flags being *equal*. Swap them and they are
  still unequal, so every check passes.
- `:264` — `String(opts.accountId) !== String(opts.qaAccountId)`. **Both sides are
  operator-supplied**, so this compares an input against itself and establishes
  nothing.
- `:702` — `createHttpWriteAdapter` builds its adapter with
  `sessionId: opts.disposableSessionId`, so on a transposition every POST lands in
  the session the operator meant to protect.

**Nothing in the harness independently establishes which session is disposable.**

## 2. Change A — establish disposability from the server

**Required property: the signal must live somewhere the operator does not control
by choosing flag order.** A value that travels with the *session on the server* has
this property; a value passed on the command line does not.

**Preferred design.** `TradingSession` (`api_server.py`, model definition) has a
non-null `name` column. Require the server's record for `--disposable-session-id` to
carry an explicit disposability marker in that name — reserved prefix
**`QA-DISPOSABLE-`** — and refuse the write-probe otherwise. Transposing the flags
then fails closed, because the real session's server-side name does not carry the
marker and the operator cannot change that by reordering arguments.

**First task, before writing the guard: establish whether an endpoint the harness
can already reach returns the session name.** The read adapter currently uses
`GET /api/sessions/{id}/state` and touches only `body.state.journal`. If the name is
not on that response, find a read-only endpoint that exposes it.

**Hard constraint: you may not modify `api_server.py` or any backend file.** The
I-7.1 grant was scoped to `_sync_trading_session_journal_trades` for the hotfix only.
If no reachable read-only endpoint exposes a usable marker, **stop and report that**
with the endpoints you checked — do not invent a backend change, and do not fall
back to a client-side heuristic and call it server-confirmed.

**Fail closed on every ambiguity**: marker absent, name absent from the response,
lookup fails, endpoint 404s, response shape unexpected, or the session does not
exist. All refuse. Never "assume disposable because we could not tell."

**Also required:** the check must confirm the marker on the session the writes will
actually target — derive it from the same value passed to `createHttpWriteAdapter`,
not from a parallel variable that could drift from it.

## 3. Change B — SAFE-01 repositioning

**`runChecks` calls `assertQaWriteSafety` at `:521`, but the adapter is constructed
and the server contacted before `runChecks` is reached.** A transport error preempts
every safety assert. They are validation, not safety.

Move all write-probe safety asserts — the existing ones and the new disposability
confirmation — **ahead of adapter construction and ahead of any other network
contact.** The disposability confirmation is itself a read, so it must be the first
network operation the write-probe performs, and it must complete successfully before
a write adapter exists.

Keep `assertQaWriteSafety` callable from `runChecks` as defence in depth. **Do not
delete the late call; add the early one.** A caller using `runChecks` as a library
must still be protected.

## 4. Keep the quarantine

`assertWriteProbeQuarantine` in `main()` **stays exactly as it is.** It is now
defence in depth. Removing it is a Director call and is not in this packet.

## 5. Acceptance

Extend `m4-ledger-invariants.test.mjs` in place. **Do not create a second test file.**
The existing suite is **26 pass / 0 fail** and stands up a local `http` server, so
add fixtures there rather than reaching any real host.

Mandatory cells:

1. **Transposition** — `--session-id=<disposable>` and
   `--disposable-session-id=<real>` swapped, marker present only on the genuinely
   disposable one. **Must refuse, and must issue zero POSTs.** Assert the POST count
   is zero, not merely that an error was thrown.
2. **Happy path** — correctly ordered flags, marker present. Proceeds, writes land in
   the disposable session.
3. **Marker absent** — refuses.
4. **Marker on the real session too** — an operator who marks both. Decide and
   document the behaviour; my expectation is refuse, since a marker on the session
   named by `--session-id` means the operator has lost track of which is which.
5. **Lookup failure** — non-existent session, 500, malformed body, missing name
   field. Each refuses independently.
6. **SAFE-01 ordering** — with an unreachable base URL, the refusal must be the
   *safety* refusal, not a transport error. This is the cell that proves the
   repositioning; today's behaviour fails it.
7. **Zero-write proof** — for every refusing cell, assert the fixture server
   received no POST at all.
8. **verify-only unaffected** — no new refusal on the read-only path.

## 6. Verification bar

- **VER-05 applies and is not optional.** The existing 26 cells and every other
  standing green touching this harness must be **re-run**, not inherited. Report
  before and after counts.
- **VER-04 both halves.** A no-op stub must die; a faithful independent
  reimplementation written from this brief's prose must pass.
- **Mutation set** for the new guard. Include, at minimum: marker check inverted;
  marker comparison made symmetric again; guard moved back after adapter
  construction; guard passing when the lookup errors; prefix matched with
  `includes` instead of a prefix test; disposability confirmed against
  `opts.sessionId` instead of the write target.
- **Line endings: LF only.** Byte-level check with `Buffer`, never a text API.
  Confirm CRLF = 0 on every file you touch, before and after.

## 7. Report

Confirmed line counts of both files. Complete final diff. The endpoint you used for
the marker and how you established it was reachable. Cell results. Mutation line as
`N designed / M survived`. Both VER-04 halves. Before/after LF counts. Anything you
touched outside §2 and §3, and why.

**If the brief is wrong, stop and report rather than implementing something you
believe is unsafe.** The last two packets both found real defects in my briefs —
`§2`/`§3` of B-W18 failed open, and B-W18's predicted killer for mutant 5 was wrong.
I would rather be corrected than obeyed.
