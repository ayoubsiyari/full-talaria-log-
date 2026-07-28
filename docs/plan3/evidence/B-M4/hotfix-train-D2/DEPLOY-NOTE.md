# DEPLOY NOTE — D-2 standalone hotfix train — trade-loss guards

**Train:** D-2 standalone hotfix. **Prepared:** 2026-07-28 by Manager B.
**Source commit:** `e996842b2270cb4ffd6e0515cf7dd4c3b840a4fd` (`manager-b/plan3-20260727`)
**Incident:** `INCIDENT-TRADE-LOSS-PUBLIC-20260728.md` — a user's entire trade
journal can be silently deleted when the backend state fetch fails or is slow.
**Ships alone, ahead of the canary train, per PO decision D-2.**

---

## 1. What changed — two guards and one record, in two files

| # | File | Change |
|---|---|---|
| 1 | `chart v 1.4/chart/modules/order-manager.js` | **Client hydration guard.** A durable journal write is refused unless the journal's provenance is vouched for — successfully hydrated from the server *for this session*, or locally authored. Anything else, including an unset or unrecognised provenance, suppresses the write and logs. |
| 2 | `chart v 1.4/chart/api_server.py` (`_sync_trading_session_journal_trades` only) | **Backend parse guard.** The delete sweep is refused outright if any incoming trade id failed to parse. **Deletion logging** — every durable journal deletion, and every refusal, now emits session id, row counts before/after, rows added, deleted ids (capped at 50) and the resolver that produced them. |

**The two are independent.** The client guard stops *this* client writing an
unhydrated journal. The backend guard stops the server deleting on ids it cannot
parse, from *any* client. Either alone is a real improvement; together they close
the confirmed chain.

**What is deliberately NOT in this train:** the backend replace semantics (out of
scope by ruling — the deeper defect and not a 48-hour change), the `chart.js`
decision to mark a failed hydration as hydrated (Manager A's, follow-up), and the
two-resolver id divergence (reported, not repaired — see §5).

## 2. Kill-switches — both default to guard-ON

| Guard | Switch | Default | To disable |
|---|---|---|---|
| Client hydration guard | `window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1` | unset → **guard on** | set to `true` in the browser; no redeploy |
| Backend parse guard | env `JOURNAL_SWEEP_PARSE_GUARD_ENABLED` | unset → **guard on** | set `false` and restart `trading-chart` |

**Both switches only recognise an explicit vocabulary, and anything else leaves the
guard ON.** This is deliberate and it is not the codebase's usual flag idiom — the
usual idiom fails *open*, and a lever that silently disables a data-loss guard on a
typo is not acceptable on this path.

| Switch | Values that DISABLE the guard | Everything else |
|---|---|---|
| `__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1` | `true`, `1`, `'1'`, `'true'`, `'yes'`, `'on'` (trimmed, case-insensitive) | guard stays **ON** — including `'false'`, `''`, `0`, `null`, garbage, and an absent `window` |
| `JOURNAL_SWEEP_PARSE_GUARD_ENABLED` | `0`, `false`, `no`, `off` (trimmed, case-insensitive) | guard stays **ON** — including `""`, `"disabled"`, and typos like `"fasle"` |

**The operational consequence: if you disable a switch and the behaviour does not
change, check the spelling before concluding the switch is broken.** A misspelled
value leaves the guard active by design. Note the two are inverted by construction —
the client flag is named `DISABLE_…` so affirmative words engage it, the backend
flag is named `…_ENABLED` so negative words do — but both reduce to the same four
words, so one runbook line covers both.

**Deletion logging has no kill-switch, by design.** If a guard is disabled the
sweep can delete again, which is precisely when the record is most needed. A switch
able to silence it would recreate the unanswerable question this train exists to
end.

**Disabling either guard re-opens the trade-loss path.** These are rollback levers
for escaping a worse failure, not configuration.

## 3. DEPLOY-01 — this train must be identifiable, and here is the catch

**Build the image through the checkpoint path.** Ordinary builds carry **no build
id at all**, by construction: `homepage/Dockerfile:35-36` *rejects* a
`CHART_BUILD_ID` unless `CHECKPOINT_BUILD=1`, and the stamping step
(`bump-chart-engine-build.mjs`, line 42) only runs under the same condition. **That
is why we cannot name what is currently live** — it is not an oversight in
record-keeping, it is that the mechanism is opt-in and was not opted into.

Required at build:

```
CHECKPOINT_BUILD=1
CHART_BUILD_ID=<assigned by the checkpoint build>
SOURCE_COMMIT_SHA=e996842b2270cb4ffd6e0515cf7dd4c3b840a4fd
```

**After the build, record the assigned build id and the image digests** in
`BUILD-RECORD.json` beside this note (use `seal-evidence.mjs`, which refuses to
overwrite an existing seal) **and in `journal/MANAGER-B.md`.** The source commit is
already pinned in `MANIFEST.json`; the build id cannot be, because it does not
exist until the build runs. Both halves are needed to answer *"was my session on a
fixed build?"*, which is the question we cannot answer today about the defect and
will not repeat about the fix.

**Known gap, not fixed here:** `window.__TALARIA_CHART_BUILD_ID` is assigned
nowhere in the tree, so `_resolvePersistBuildId()` (`order-manager.js:26`) always
returns `null` and every persisted row carries `build_id: null`. I16's per-row
stamp therefore stamps nothing. This is a DEPLOY-01 sibling and a
capability-loss-without-failure instance; it is **not** in this train because a
data-loss hotfix is the wrong vehicle for it.

## 4. What the PO verifies

`PO-VERIFICATION.md`, beside this note. Six steps, about ten minutes, **written to
be safe to run even if the build in front of them is still the defective one** —
the tester export notice has not gone out, so that is not a hypothetical.

Shape of it: identify the build **before touching any session**; confirm the switch
is unset; create a throwaway session; confirm the normal path still works; induce a
failed hydration **only in the throwaway** and watch the guard fire; confirm the
server now records deletions. The STOP condition is reproduced verbatim at the top
and applies throughout.

## 5. Evidence and residual risk

Verification, all reproduced by the manager in its own worktree:

| Packet | Result |
|---|---|
| B-W16 client guard | RED 20/35 → GREEN 35/35; **9 designed / 0 survived**; no-op stub dies, independent reimplementation passes |
| B-W17 backend guard + logging | RED 9 failed → GREEN 14 passed; **12 designed / 0 survived**; both VER-04 halves; real SQLite session over the shipping model |

**Residual risk, stated rather than discovered:**

- **Brand-new sessions.** A server that answers "I have nothing" is indistinguishable
  from one that cannot be reached, at the layer the guard sits in, so a first-visit
  session stays unvouched and its *durable* writes are suppressed. Hot autosave still
  carries the journal, and the session self-heals to vouched on the next load. Net
  exposure is the newest trades of a first-visit session closed before autosave
  fires — strictly better than deleting every older row, and the accepted trade.
- **The two-resolver divergence.** The sweep's inline parse reads `tradeId|id`; the
  codebase's self-described canonical resolver reads four keys. Rows keyed
  `trade_id` are canonical yet invisible to the sweep. **After this train that no
  longer destroys data** — it trips the guard and emits `[JOURNAL-SWEEP-REFUSED]`
  naming the resolver, turning silent corruption into an observable event. Repairing
  the divergence changes which rows count as present on a delete path and belongs
  with replace semantics.
- **Already-lost data is not recoverable and not detectable.** Nothing was recorded
  before this train. The logging makes the question answerable from now on only.
