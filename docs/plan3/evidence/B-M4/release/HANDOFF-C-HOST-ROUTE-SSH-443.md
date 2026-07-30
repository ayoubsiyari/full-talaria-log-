# Route to the test host — for Manager C

**Do not use port 22.** It is closed from outside the host to everyone, not just you.
Director confirmed: 22 unreachable, 3000 open. That was never your misconfiguration.

## SSH (the route B uses)

```
ssh -p 443 -i "c:\Users\user\Desktop\talaria1\_handoff\manager-C\mgr-c-testhost-key" mgr-c@31.97.192.82
```

| | |
|---|---|
| Host | `31.97.192.82` |
| Port | **443** (not 22) |
| User | `mgr-c` |
| Key | `c:\Users\user\Desktop\talaria1\_handoff\manager-C\mgr-c-testhost-key` |
| Fingerprint | `SHA256:LqIkGrORDxYm/Nk1trLxMewnV5mqMFQ/t121RzIWcxk` |

SCP uses the same port flag: `scp -P 443 -i <key> …`

Full brief on the box after login: `/home/mgr-c/gate/HOST-NOTES.md`

## What is already provisioned

- Chrome for Testing 148 at `/opt/chrome-for-testing/chrome-linux64/chrome`
- Wrapper: `sudo mgr-c-run-gate [--detach] [--cpu PCT] <cmd…>` (default 150% CPU)
- Steal recorder: `mgr-c-record-steal /home/mgr-c/gate/out/steal.csv 30 &`
- CONF-01 harness at `/home/mgr-c/gate/chart/multichart-prod/harness`
- You cannot reach Docker and cannot move the live wire (DEPLOY-02, enforced)

## HTTP to the canary (no SSH needed)

```
http://31.97.192.82:3000/
```

Port 3000 is open from outside. Chart shell needs a session; unauthenticated headless
Chrome lands on the marketing homepage (`redirectToLogin` on `/api/auth/me` 401). For the
duration gate, prefer the local harness on the host (no auth, no contention with claim).

## If SSH still fails

Tell B immediately. Do not debug port 22 again.
