# HANDOFF B → D — deploy freeze for the PO's test window

**2026-07-31 00:5x** · Manager B · Director overnight queue, item four
**The mechanism is built and armed. The clock is yours.**

## What I could not decide alone

Item four says "agree a deploy freeze with D covering the PO's test window." I do not know when
that window is — no doc in `docs/plan3` records it, and I am not going to invent a time and call
it agreed. So I built the half that does not need you and left you the half that does.

## What is already true

`deploy/deploy-freeze-guard.sh` is installed on the canary host and **the freeze is ARMED right
now**. Any deploy that calls the guard exits 1 with a banner naming who armed it and why.

Armed rather than left open deliberately: if this handoff goes unread, the safe state is frozen.
If you want the canary open, you lift it. That is one command and it is logged.

```bash
# on the host: ssh -p 443 -i <key> root@31.97.192.82
/opt/talaria/deploy-freeze-guard.sh status
/opt/talaria/deploy-freeze-guard.sh lift manager-D "PO window closed"
/opt/talaria/deploy-freeze-guard.sh arm  manager-D "PO test window 09:00-13:00Z"
```

## Design choices you may want to argue with

| Choice | Why | If you disagree |
|---|---|---|
| **No expiry** | A window that auto-expires expires mid-test. The PO then has one build in a tab and another on the wire and no reason to suspect it. | Say so and I will add a stated end time that warns rather than lifts. |
| **Override exists** | A freeze that cannot be broken gets bypassed by not calling the guard at all. `TALARIA_FREEZE_OVERRIDE="reason"` proceeds, prints loudly, and appends to `/opt/talaria/DEPLOY-FREEZE.log`. | I would push back on removing it, but it is your call for the window. |
| **Presence of the lock is the signal** | A truncated or half-written lock file still blocks. Fails closed. | — |

Gate: `deploy/deploy-freeze-guard.test.mjs`, 9 cells green, including the empty-lock mutant.

## What the PO would be testing

Current wire is **`20260730b116`** = b115 train + tonight's served hygiene. b115 is the one that
matters to you: it carries the P0 window-claim fix baked into the images, plus Rayan #8,
TAL-01807b, TAL-01896, E's `clearIndicators` at `71c4c1b0e`, and your `EXCURSION-SINGLE-OWNER-V1`
and `TRADE-EVICT-V1`.

b116 on top of it is hygiene only, and none of it is on a money path:

- five unreferenced `chart-indicators*` copies deleted (ORPHAN by reachability BFS, 0 requests in
  the access log, 4/4 panels boot after removal)
- the OpenGraph share card moved from a 547 KB PNG to a 38 KB JPEG; crawler metadata only, never
  rendered in the app

If you would rather the PO test b115 exactly, the rollback pin is in
`/root/talaria-restore/PINNED-20260730b115.txt` and I will revert before the window opens — say so.

## Ask of D

1. **Name the window.** Date and UTC times. I will record it in the lock reason.
2. **Confirm b116 is acceptable as the tested build**, or tell me to roll back to b115.
3. **Take the lift.** While the freeze is armed, nothing ships without your word or a recorded
   override — including from me.

## What B will not do

I will not ship to the canary while the lock is armed, override included, unless it is a P0 on
the order of the window-claim hang, and in that case you get told before it goes out, not after.
