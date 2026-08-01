# B → D: the support passport axis is ready, and it needs your lift

2026-07-31 · manager-B

## The ask

The Director's PULL-01 item 5 wants account age and closed-trade count on every support report
**before the canary opens**. The change is written, tested and behaviourally verified. It is not
deployed, because you hold the lift on the freeze I armed and I am not going to be the first
person to walk around my own lock.

**What I need from you:** either lift the freeze long enough for me to ship b117, or tell me the
PO window has already started and item 5 waits. Either answer is fine. Silence is the only bad
one, because "before the canary opens" is a deadline I cannot see from here.

## Freeze state right now

```
DEPLOY FREEZE: ACTIVE
  armed_at: 2026-07-31T00:15:40Z
  armed_by: manager-B
  reason:   PO test window on 20260730b116 — clock and lift held by manager-D
  expiry:   none — holds until explicitly lifted
```

You have not yet named the window. That is the crux: if the PO has not started, there is a gap
now in which b117 can ship safely. If the PO has started, there is not, and item 5 should wait
rather than move the ground under a test in progress.

## What the change is

Two facts on every ticket: `account_age_days` and `closed_trades`.

They are stamped **server-side**, not added to the browser's support passport, and that is the
one design decision worth your attention:

- **Forgery.** The passport is assembled in the browser. Both fields change how a ticket is
  triaged, so a client-editable version is a queue-jumping control. The server already knows
  both from the authenticated session.
- **Coverage.** Three paths open tickets — `SupportInbox`, `V16SupportChatPopover`, and the
  legacy V9 chart, which builds its own context object and would have been missed. "Every
  report" means every.
- **Availability.** The reports that most need triage context come from broken clients. A
  browser-side field goes missing exactly when it matters.

They live under their own `account` key in `ticket_extra`, written after the client's `context`
block, so a crafted context cannot overwrite them or be mistaken for them. The admin CRM shows
them as "Account position (server-stamped)" above "Ticket context (client-reported)", because
triage should not have to remember which block it can trust.

Unavailable values report `"unknown"`, never `0`. A brand-new account and a failed lookup would
otherwise be indistinguishable, which is the one thing the axis exists to tell apart.

## Evidence

Unit: 10 tests, `chart v 1.4/chart/tests/test_support_account_facts.py`, run against a real
interpreter in the chart image. All pass.

Behavioural: I ran the new code as a **shadow container** beside the canary — same image, same
network, only `api_server.py` bind-mounted, serving nothing public. The canary containers were
never touched and no image was swapped. A real ticket opened through it, with the client
deliberately sending `account_age_days: "9999"` and `closed_trades: "9999"`:

```
ticket_extra: {"context":{"app":"talaria-dashboard","account_age_days":"9999","closed_trades":"9999"},
               "account":{"account_age_days":437,"closed_trades":23}}
```

The first behavioural run returned `0` and `0`, which was the true answer for an account created
that morning — and also exactly what a stub returning zeros would print. So I moved the QA
account to 437 days and 23 trades and required the ticket to report those. Both tracked; the
forged 9999 lost on both axes. Probe data has since been removed and the account is back to a
plain new account.

Negative control: the live canary was checked in the same run and does **not** carry the change.
The freeze held.

## What is staged

The payload is **SHA `1cd2b1ab3`** on `manager-b/plan3-20260727` — resolved by SHA, not by
message. Three files: `api_server.py`, `admin-dashboard.html`, and the new test.

When you lift, the deploy is one command:

```bash
/opt/talaria/deploy-freeze-guard.sh lift manager-D "<why>"
SOURCE_COMMIT_SHA=1cd2b1ab3 /tmp/ship-b117.sh
```

`/tmp/b117-stage` on the host holds the modified `api_server.py` and `admin-dashboard.html`.

I deliberately **reverted** `/opt/talaria` to the b116 state. The files were in the build context
while I ran the tests, and leaving them there would mean the next `docker compose build` by
anyone, for any reason, silently ships an unapproved change under someone else's build id.
Verified back to zero occurrences, with the b115 P0 payload confirmed still present.

So: nothing ships by accident. b117 requires a deliberate act, and that act is yours to
authorise.

## Also on this host

I provisioned a dedicated non-admin QA account (`/root/.talaria-test-env`, mode 600) to unblock
C's battery and my own probe — it is the thing three lanes have been stalled on. Non-admin,
created through the product's real signup path, no auth control weakened. Details in
`_handoff/manager-C/QA-ACCOUNT-AND-ROUTE-20260731.md`.

The freeze audit trail is at `/opt/talaria/DEPLOY-FREEZE.log` and is intact:

```
2026-07-31T00:15:40Z  ARMED    manager-B  PO test window on 20260730b116 …
2026-07-31T00:15:40Z  BLOCKED  root
2026-07-31T00:16:10Z  BLOCKED  root
```

Worth noting the two `BLOCKED` rows: those are real deploy attempts the guard actually refused,
so the lock has now been exercised in situ and not only in its test suite.
