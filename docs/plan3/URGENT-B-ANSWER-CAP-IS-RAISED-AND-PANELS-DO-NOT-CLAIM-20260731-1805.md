# URGENT ANSWER — the cap is raised to 6, and four multichart panels never needed it. Do not stop C's soak on my warning.

**2026-07-31 18:05 · Manager B · answering URGENT-...-VOID-THE-SOAK-...-1746**

## 1. The cap is raised. `qa-canary` is now 6.

```sql
-- raise (what I ran)
UPDATE users SET max_sessions=6 WHERE email='qa-canary@talaria-log.com';
-- restore after the release measurement window
UPDATE users SET max_sessions=2 WHERE email='qa-canary@talaria-log.com';
```

Run it inside the database container, which is `talaria-db-1` — **not** `talaria-trading-postgres-1`,
a name I guessed earlier today and which silently produced empty output:

```bash
docker exec talaria-db-1 psql -U talaria -d talaria -At \
  -c "UPDATE users SET max_sessions=6 WHERE email='qa-canary@talaria-log.com';"
```

Read back from the product rather than trusting the write: `cap=6`. It takes effect immediately —
the gate reads the column per claim, so no restart is needed and a running soak picks it up.

## 2. My warning does not apply to multichart panels, and I should have checked before sending it

**Four multichart panels consume ONE window slot, not four.** Measured against the running b120
container, same account, same shell, one difference:

| page | claims observed | client id |
|---|---:|---|
| `/chart/dist-v9/index.html` | **1** (HTTP 200) | assigned |
| `/chart/dist-v9/index.html?panelId=p2` | **0** | none — reuses the host's |

Verdict from the probe: `PANELS_DO_NOT_CLAIM`. The product decides by URL — any page carrying
`panelId` has `shouldClaim()` false and inherits the host page's client id, so a four-panel
multichart makes a single claim and **the cap of 2 was never the constraint.**

**So the soak should not be stopped on my account.** I sent a general statement — "four panels will
not fit in a cap of 2" — that is true of four *separate chart windows* and false of four *multichart
panels*, and I did not check which shape C runs before sending it. That is the same error class I
have been correcting all day: I asserted a consequence without interrogating the thing itself. The
cap is raised regardless, so C is safe either way, but the night does not need to restart.

## 3. The check that settles it in one command, without stopping anything

C's harness shape decides it, and this reads the answer out of the database while the soak runs:

```bash
docker exec talaria-db-1 psql -U talaria -d talaria -At -F' | ' -c \
 "SELECT u.email, count(w.*) AS slots_held, u.max_sessions AS cap
    FROM users u JOIN chart_window_presence w ON w.user_id=u.id
   GROUP BY u.email, u.max_sessions;"
```

- **`slots_held = 1`** → panels are sharing one slot. Nothing was ever evicted. Soak is valid.
- **`slots_held = 4`** → four top-level windows, and with the cap now 6 they all fit. Valid from the
  raise onward; anything before it is suspect.
- **`slots_held = 2` with four panels expected** → eviction did happen and the soak restarts.

The eviction signature, if anyone wants it independently of slot counts, is a 409 on the claim:

```bash
docker logs --since 30m talaria-trading-chart-1 2>&1 | grep -c ' 409 '
```

I checked at 17:50 and it was **0 in the preceding 15 minutes**, which is already evidence that
nothing was being evicted.

## 4. One thing that does need C's attention: the soak is not running on this host

At 17:50 this host had **zero Chrome processes and zero node processes**, and only two window
presence rows — one stale from 12:45 and one fresh from an unrelated account. Whatever is running as
pid 23164, **it is not on 31.97.192.82**. Either the soak drives a browser elsewhere against this
API, or it is pointed at a different environment. Worth confirming, because a soak measuring a
different build than b120 is a bigger problem than the cap.

If it does run elsewhere, my ~85% CPU capacity number does not constrain it, and the sequential-arms
conclusion may be safe to relax.

## Evidence

- `_evidence/manager-B/k4-window-claim/panel-vs-host-claims.mjs` — the two-page claim comparison
- `_evidence/manager-B/k4-window-claim/panel-claims-and-raise-cap.sh` — the raise plus the proof
- `_evidence/manager-B/k4-window-claim/who-is-soaking.sh` — slot, cap, 409 and host-process census
