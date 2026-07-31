# RELEASE CHECKLIST — test state on the canary that must not survive into the release

**Opened 2026-07-31 18:30 · Manager B**

The canary is the release, so anything I changed on it to make a measurement possible is something a
real user will otherwise meet. This exists so none of it is left to memory. Items are mine unless
another manager adds theirs; **each line names the owner, the exact undo, and how to verify the undo
against the thing itself rather than against this file.**

## Open items

### 1. `qa-canary@talaria-log.com` session cap raised from 2 to 6 — owner B

Raised at 18:05 so C's four-panel `CONF-05` soak could not be evicted mid-run. It turned out panels
do not consume slots, so this is insurance rather than a necessity, but it is still a live
entitlement change.

```bash
docker exec talaria-db-1 psql -U talaria -d talaria -At \
  -c "UPDATE users SET max_sessions=2 WHERE email='qa-canary@talaria-log.com';"
# verify against the database, not this file:
docker exec talaria-db-1 psql -U talaria -d talaria -At \
  -c "SELECT email||' max_sessions='||max_sessions FROM users WHERE email='qa-canary@talaria-log.com';"
```

**Do not undo while a measurement is running.** Check first:

```bash
docker exec talaria-db-1 psql -U talaria -d talaria -At -F' | ' -c \
 "SELECT u.email, count(w.*), u.max_sessions FROM users u
    JOIN chart_window_presence w ON w.user_id=u.id GROUP BY u.email, u.max_sessions;"
```

### 2. `k4-probe@talaria-log.com` (user id 131) must be removed — owner B

Created by `_evidence/manager-B/k4-window-claim/seed-k4-account.sh` to reproduce window eviction on a
`max_sessions = 1` account, which the QA account cannot do. **Credentials cloned from `qa-canary`, so
it carries no new secret**, but it is a live account with journal entitlements that exists only for a
test. Kept active tonight in case C needs a cap-1 account.

```bash
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "DELETE FROM chart_window_presence WHERE user_id=131;"
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "DELETE FROM users WHERE email='k4-probe@talaria-log.com';"
# verify it is gone:
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT count(*) FROM users WHERE email='k4-probe@talaria-log.com';"   # expect 0
```

### 3. Seeded journal data on `qa-canary`, session 936 — owner B, decision needed

I seeded a heavy journal to make the TAL-01891 memory work measurable: **182 trades, 395 screenshots,
~50 MB of `payload_json`**. D's `M1` still depends on it, and it is the only session heavy enough to
exercise the path, so **it should not be removed until `M1` is closed.** After that, it is synthetic
data sitting on a QA account in the release's database and someone should decide whether it stays.

## Closed items

### `TALARIA_DISABLE_WINDOW_GATE_THREADPOOL_V1` in host `.env` — closed 17:40, owner B

Written during the K4 falsifiable-gate test. Removed; verified absent both from the host `.env` and
from the running process:

```bash
docker exec talaria-trading-chart-1 sh -c 'printenv TALARIA_DISABLE_WINDOW_GATE_THREADPOOL_V1 || echo "<unset>"'
grep -c 'TALARIA_DISABLE_WINDOW_GATE_THREADPOOL_V1' /root/talaria-deploy/.env
```

### Four K4 scratch containers, two on b118 — closed 17:35, owner B

`k4-tiny-fixed`, `k4-tiny-unfixed`, `k4-fixed-api`, `k4-scratch-api` on ports 3101–3104. Removed. Two
were on `canary-20260731b118`, which is the build carrying the window-gate defect — a b118 endpoint on
the canary host is a trap for anyone who probes it believing they have the canary.

### Orphaned measurement probe holding 13 Chrome processes — closed 17:50, owner B

Left running at loadavg 12.13 after I signalled a wrapper shell rather than its node child. Killed;
the arm script now restores its own state via a trap on `EXIT`/`INT`/`TERM`.

## The rule this checklist exists to enforce

Every item above was found by **interrogating the container or the database, not by consulting my
notes.** Three of them I did not know about until I looked. So the check that populates this file is
the standing one: after any pass that touched shared state, ask the thing itself what state it is in.
