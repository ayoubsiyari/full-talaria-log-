# BRIEF — B-W18 — kill-switches and negative controls for the D-2 hotfix train

**Packet:** B-W18. **Dispatched:** 2026-07-28 14:40 by Manager B.
**Authority:** `order-manager.js` (TERRITORY.yml:174, B's) and `api_server.py`
`_sync_trading_session_journal_trades` **only** (Director ruling I-7.1, unexpired —
the hotfix train has not shipped yet).
**Worktree:** `C:\Users\user\Desktop\talaria1\manager-b-plan3`. TREE-02 applies.

---

## 0. Reserved names — use these exactly, do not invent variants

Reserved by the manager before dispatch, per §A13 dispatch hygiene:

| Surface | Name | Default when unset |
|---|---|---|
| Client | `window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1` | guard **ON** |
| Backend | env `JOURNAL_SWEEP_PARSE_GUARD_ENABLED` | `"true"` → guard **ON** |

**Both must default to guard-on.** An unset flag, an empty string, a typo'd value,
or an absent `window` must all leave the guard **active**. This is a rollback lever,
not a feature flag, and the failure direction is not symmetric.

## 1. Scope — two additive changes, nothing else

You are **not** changing guard logic. Both guards are shipped, green, and committed
(`2521a7484`, `e996842b2`). You are adding a way to switch each one off in an
emergency, and a test proving the switch actually works.

**Out of scope, automatic reject:** any edit to the guard conditions themselves;
`chart.js`; `journal-backend/`; anything in `api_server.py` outside
`_sync_trading_session_journal_trades`; the hot autosave path; replace semantics.

**The deletion logging is deliberately NOT killable.** Do not add a switch for it.
If the parse guard is ever disabled the sweep deletes again, and that is precisely
when the record matters most. A switch that can silence the deletion log would
recreate the unanswerable question this train exists to end.

## 2. Client — `order-manager.js`

Follow the file's existing idiom exactly (see `_orderPersistenceV1Enabled` at `:22`):

```js
function _bW16HydrationGuardEnabled() {
    return typeof window === 'undefined' || !window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1;
}
```

Apply it to the guard branch in `persistJournal` so that when the kill is engaged
the durable write proceeds exactly as it did before B-W16 — same return shape, no
suppression, no warning. **When the kill is engaged the code path must be
behaviourally identical to the pre-fix source.** That is what makes it a rollback.

## 3. Backend — `_sync_trading_session_journal_trades`

Match the file's env-flag idiom (see `:264`, `:577`):

```python
JOURNAL_SWEEP_PARSE_GUARD_ENABLED = os.getenv(
    "JOURNAL_SWEEP_PARSE_GUARD_ENABLED", "true"
).strip().lower() in {"1", "true", "yes", "on"}
```

**Read it at call time, not import time, if that is what the tests need** — say
which you chose and why. Module-level constants are the file's convention but they
cannot be toggled per-test without reimport; if you use a module constant, have the
test monkeypatch the module attribute and say so.

When disabled, the refusal branch is skipped and the sweep behaves as before —
**but the deletion log still fires.**

## 4. Negative-control cells — the point of the packet

Standing policy: *"Every covered gate keeps a paired cell running with the relevant
kill-switch OFF, asserting RED. A gate whose negative control is green is a lying
gate."*

Add to the existing acceptance files, do not create new ones:

**Client** (`b-w16-hydration-guard.test.mjs`):

1. **NC-1.** Kill engaged + the cell-1 defect state → the durable write **proceeds**
   and the server journal is replaced. Assert the loss reproduces. *This cell must
   be RED-by-design: it asserts the defect returns when the guard is off.*
2. **NC-2.** Kill **unset** → cell 1 still suppresses. Proves default-on.
3. **NC-3.** Kill set to a falsy/garbage value (`undefined`, `''`, `0`, `'false'`)
   → guard **still active**. `'false'` is a truthy string and would disable the
   guard under a naive check; if your implementation disables on `'false'`, that is
   a finding — report it, and state which values disable the guard.

**Backend** (`test_b_w17_journal_sweep_guard.py`):

4. **NC-4.** Guard disabled + the cell-1 alias payload → all rows deleted, i.e. the
   wipe reproduces.
5. **NC-5.** Env var unset → guard active (cell 1 still protects).
6. **NC-6.** Guard disabled → `[JOURNAL-DELETE]` is **still emitted**. Proves the
   logging is not coupled to the guard.

## 5. Mutation set — declare `N designed / M survived`

1. Client kill defaults to disabled when `window` is absent → must die on NC-2.
2. Client kill inverted (guard active only when the flag is set) → dies on NC-2.
3. Backend default flipped to `"false"` → dies on NC-5.
4. Backend flag also gates the deletion logging → dies on NC-6.
5. Client kill also disables the hot autosave path → dies on the existing cell 6.
6. Kill engaged but the guard still suppresses (a switch that does nothing) → must
   die on NC-1 and NC-4. **This is the one that matters: a kill-switch nobody
   verified is worse than none, because it will be reached for in an incident.**

## 6. VER-04 and regressions

State both halves as usual. **And confirm the pre-existing suites still pass:**
`b-w16-hydration-guard.test.mjs` must stay at 35/35 with the kill unset, and
`test_b_w17_journal_sweep_guard.py` at 14/14. Report both counts.

## 7. Line endings — mandatory, we have been bitten twice today

Any harness that rewrites a source file **must restore it and verify the
restoration in bytes**, not through a text API. Python's `write_text` and
PowerShell's `Set-Content` translate `\n` to `\r\n` on Windows, and a
`read_text() == original` check passes straight through that corruption because the
read translates it back. Both source files are **LF**. Before you report, run a
byte-level check that neither file has gained a `\r\n` and paste the result.

## 8. Report back

Diff; NC cell results; the exact list of values that disable each switch; mutation
line; VER-04 both halves; both regression counts; the CRLF byte check; and anything
touched outside §2 and §3.
