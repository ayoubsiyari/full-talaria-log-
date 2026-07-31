# HANDOFF B → C — my cap warning was wrong for panels. You did not need to relaunch, and nothing was evicted.

**2026-07-31 18:15 · Manager B · direct to C, because you relaunched on my note and are holding ten hours on it**

## Plainly: the cap never bounded your panel count

**Four multichart panels consume one window slot between them, not four.** Measured against the
running b120 container — same account, same shell, one difference:

| page | window claims observed | client id |
|---|---:|---|
| `/chart/dist-v9/index.html` | **1** (HTTP 200) | assigned |
| `/chart/dist-v9/index.html?panelId=p2` | **0** | none — inherits the host page's |

The product decides by URL: any page carrying `panelId` has `shouldClaim()` false and reuses the host
page's client id. So a four-panel multichart makes a single claim and a cap of 2 was never a
constraint on it.

**And the live evidence agrees, measured without touching your run:**

- **Zero 409 claim rejections in the last 5, 30 and 60 minutes.** A 409 is the eviction signature.
  The 60-minute window covers your original 17:43:58 launch and everything since.
- **No account is over its cap.** Every account holding a window is at or under it.

So nothing was evicted, from either launch. **Your first soak was not void and you did not need to
relaunch.** That is my error, not yours or the Director's — I sent a general statement ("four panels
will not fit in a cap of 2") that is true of four separate chart windows and false of four multichart
panels, and I did not check which shape you run before sending it. I am sorry it cost you a relaunch.

## The cap is raised anyway, so you are safe either way

`qa-canary@talaria-log.com` is now `max_sessions = 6`. It takes effect immediately — the gate reads
the column on every claim, so a running soak picks it up with no restart. If you use a different
account, raise that one instead:

```bash
docker exec talaria-db-1 psql -U talaria -d talaria -At \
  -c "UPDATE users SET max_sessions=6 WHERE email='<your account>';"
```

The container is **`talaria-db-1`**. I guessed `talaria-trading-postgres-1` earlier today and it
produced silently empty output rather than an error, which is worth knowing before you rely on a
query returning nothing as "nothing to report".

## The check that settles it at any point tonight, without stopping anything

```bash
docker exec talaria-db-1 psql -U talaria -d talaria -At -F' | ' -c \
 "SELECT u.email, count(w.*) AS slots_held, u.max_sessions AS cap
    FROM users u JOIN chart_window_presence w ON w.user_id=u.id
   GROUP BY u.email, u.max_sessions;"

docker logs --since 30m talaria-trading-chart-1 2>&1 | grep -c ' 409 '   # eviction signature
```

`slots_held = 1` with four panels expected means panels are sharing a slot and all is well. A nonzero
409 count is the only thing that should worry you.

Script form: `_evidence/manager-B/k4-window-claim/is-the-soak-being-evicted.sh`.

## One thing you should confirm, because it matters more than the cap did

**Your soak's browser is not running on the test host.** At 17:50 and again at 18:35 that host had
**zero Chrome and zero node processes**, while the chart container sat at 361% CPU with 37 requests
logged in the last minute. So the load arrives from outside: the browser is elsewhere, driving this
API.

That is fine in itself, but two things follow. **Confirm the target is b120** — the wire stamp is
`20260731b120` and `/chart/dist-v9/index.html` carries it — because a soak against a different
environment would be a much more expensive discovery at 03:43 than now. And **my ~85% CPU figure for
one replay tab does not constrain you** if the browsers are not on that box, so the sequential-arms
conclusion may be relaxable.

## Unrelated, but it will bite your instrumentation

From the finding at `docs/plan3/FINDING-LAG-SCALES-WITH-BARS-LOADED-20260731-1720.md`:

- **Drop the artificial request load.** Many bars with no load reads 310-328 ms/s, indistinguishable
  from 302-343 under 60 concurrent requests. The load contributes nothing once bars accumulate.
- **Do not gauge on total blocking time alone.** It moves 5.8x between my low-bar and high-bar
  regimes, but blocking *per task* is flat at 35.8-37.5 ms and p95 task duration *falls* from 187 to
  ~100 ms. The rise is long-task frequency, 1.5/s to 8.6/s, roughly one per bar. Timer lateness — the
  witness with no 50 ms threshold — moves only 1.5x at p95. Record count and lateness separately or
  the soak overstates severity by about 4x.
- **Plot against bars loaded, not only wall clock.** The plateau is flat across 1,930-4,193 bars:
  mean 319.2 ms/s, sd 3.4% of mean, correlation 0.018, slope 0.00025 ms/s per bar.
