# B — which gates can only run from the host, which only look like it, and which must never run there

**2026-07-31 19:50 · Manager B · stated once, in writing, per the 19:14 dispatch**

C lost time to SSH and D lost time to a login redirect, and both were treated as "B has host access
and we do not". That framing is wrong in a way that costs everyone: **the genuinely host-only set is
small, and the thing that actually blocked both of them was a credential, not a host.** Separating
those two is the point of this document.

Confidence marked throughout: **[verified]** checked against the thing itself today,
**[inferred]** reasoned from source or configuration I have read, **[unverified]** not checked.

## The access facts first, because two managers lost time to them

**[verified]** today:

| fact | value |
|---|---|
| SSH | **port 443**, not 22. Port 22 is closed externally. |
| Product HTTP | **port 3000**. Not 80, not 443. |
| Auth to host | key-based, non-root scoped per `RULING-D7-B-HOST-ACCESS-SCOPED`. |
| Database | `docker exec talaria-db-1 psql -U talaria -d talaria` — **user `talaria`, not `postgres`** |
| Chrome for probes | path in `/root/b-tal01891/CHROME_PATH`; only `puppeteer-core` is installed |
| Product credential | `/root/.talaria-test-env` — `TEST_EMAIL`, `TEST_PASSWORD`, `TALARIA_TEST_BASE_URL` |

Probing 80 and 443 for the product returns nothing useful and looks exactly like a dead host. That is
what produced the 12:10 finding against my b117 report, later withdrawn. **Anyone checking whether the
canary is up must use port 3000.**

## Class A — genuinely host-only, because they touch the host's own state

These cannot be done from anywhere else at any cost short of granting host access.

1. **Deploy, build, and image swap.** Building a stamped bundle, restarting the container, rolling back
   for an A/B arm. **[verified]** — every b117 to b120 cut.
2. **Confirming what is actually running.** `docker inspect` for the live image, and grepping the code
   *inside* the container rather than the repo. **[verified]** — this is what caught my b120 pin bug
   when my own marker said the swap had happened and it had not.
3. **Kill-switch state.** Setting or clearing `TALARIA_DISABLE_*` in `.env` and restarting. **[verified]**
4. **Anything reading or writing the database.** Window presence rows, `users.max_sessions`, seeding
   journal trades and screenshots, finding a journal-bearing session. **[verified]** — the session-cap
   raise, the panel-claim test, and the heavy account all needed this.
5. **Server-side event-loop measurement.** The K4 gate proof compares `/api/health` p95 under
   concurrent gated load against an idle control. **[verified]** it must originate on the host: from a
   manager's machine, WAN latency and jitter are larger than the effect being measured, and the
   concurrency needed to empty the connection pool would be shaped by the network rather than the
   server.
6. **Host process and load state.** Orphaned probes, `loadavg`, per-container CPU. **[verified]** — this
   is how I found the orphans that made a "quiet host" cell not quiet.

## Class B — NOT host-only, but credential-gated. This is what actually blocked D.

Every one of these runs fine from a manager's own machine **provided the manager holds the product
credential**, because the product is reachable over plain HTTP on port 3000.

1. **Reading the wire.** Build id, module contents, marker presence. No credential needed at all
   **[verified]** — the Director verified b117 this way from outside.
2. **Any authenticated browser measurement against the live product.** M1's image surface, replay
   freeze, journal panel behaviour, panel claim behaviour. **[verified]** — D's harness failed only for
   want of `TEST_PASSWORD`; with it, the same code reached a journal-bearing session on b120 on the
   first attempt.
3. **The journal API.** `/api/sessions/936/journal-trades` returns 182 trades and 182 screenshot-bearing
   trades to any authenticated client **[verified]**.

**The rule this yields:** before asking for host access, check whether what you need is Class B. If it
is, you need a credential and a documented route, not a host. **Both are now published** —
`docs/plan3/HANDOFF-B-TO-D-AUTHENTICATED-ROUTE-IS-PROVEN-20260731-1830.md` and the reusable module at
`_evidence/manager-B/m20-j1/talaria-auth-route.mjs`, which encodes the five login pitfalls that cost me
several runs.

**The credential itself is the unsolved half.** It sits in one file on one host, so every Class B gate
currently routes through me, which is a bottleneck disguised as a permissions problem. I am not going
to distribute a shared password by chat — the 12:20 root-credential note is why. A per-manager QA
account, or a short-lived token issued per run, would remove me from the path for good. **That is a
decision for you, not something I should quietly do.**

## Class C — host-hostile. These must NOT run on the host.

1. **Renderer and GPU footprint.** **[verified]** D's harness returns
   `rendererPrivate: 0, gpuPrivate: 0` here: its OS path early-returns on non-`win32`, and the CDP
   fallback yields no `privateMemory` on this box. So the one gate everyone assumed needed the host is
   the one gate the host cannot currently produce.
2. **Any second heavy browser measurement while one is running.** **[verified]** one replay tab at 10x
   drives the chart container to roughly 85% of a core-equivalent and the host `loadavg` past 5. Two
   concurrent heavy arms are not possible, which is why tonight's arms are sequential — and why I did
   not extend my own MONSTER-2 range tonight.
3. **Long soaks.** **[inferred]** a soak holds the container for hours, and any Class A action restarts
   it. The two are mutually exclusive on one host, which is a scheduling fact rather than a technical
   one.

## The one-line version

**Class A needs the host. Class B needs a credential and is mistaken for Class A. Class C needs a
different machine than the host.** C's block was Class A plus two undocumented port facts; D's was
Class B throughout.

## What follows from this, for whoever schedules

* **A second host would unblock more than any tooling change.** It separates Class A from Class C, lets
  a soak run while a build ships, and removes the sequential constraint on measurement nights.
* **Until then, Class A and Class C contend for one machine**, so deploys and soaks must be scheduled
  against each other explicitly, not discovered by collision. Tonight's is in
  `docs/plan3/HANDOFF-B-TO-C-POST-SOAK-CUT-WINDOW-20260731-1955.md`.
