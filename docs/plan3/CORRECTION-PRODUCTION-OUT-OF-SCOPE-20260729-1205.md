# CORRECTION — **The production trade-loss authorisation is withdrawn. Production is out of scope entirely.** The canary runs on the test host `31.97.192.82`, user backtest data on `talaria-log.com` is disposable and users are informed, and **the trade-loss fix has already been live on the canary host since B's `b82` deploy last night.** B's SSH blocker is dissolved rather than resolved — the access was never needed, because I escalated to production on a harm assumption the PO had already contradicted.

**2026-07-29 12:05. PO: "the canary will take place on the server A is working on, not www.talaria-log.com… the data of the users backtests on the website is disposable, they are informed about that… all deployments must be done on the server we have been testing yesterday."**

---

## 1. The error

**At 03:50 I authorised B to ship the trade-loss hotfix to `talaria-log.com`, independent of the canary train, and ranked it the most time-sensitive item on the board on the grounds that "live users are still unprotected."**

**The PO's authorisation read in full: "yes for the trade loss, fix the problem, the users sessions data is irrelevant."** **I interpreted the final clause as tolerance for disruption during a deploy. It meant the data has no value.** **I wrote my reading into the ruling explicitly, as "disruption tolerance, not delete permission," and treated my own gloss as settled rather than checking it.**

**Once the data is disposable and disclosed, the trade-loss defect on production causes no user harm, and the entire justification for touching production disappears.** **I was not weighing a risk the PO had misjudged — I was inventing one the PO had already priced at zero.**

## 2. What this costs and what it does not

**B spent roughly an hour on deploy-path enumeration, one-action scripting and a full test-host rehearsal for a deploy that will not happen.** **That hour is on me.**

**Two things survive and are worth keeping.** The enumeration is a real finding — no CI path reaches the origin, `build-images.yml` publishes to GHCR only, and `scripts/deploy.sh` assumes it is already on the host. **That answers a question we would otherwise have asked again later.** And the one-action script, rehearsed green on the test host with restore point, worker restart and a verified `journalVouchedFor` probe, **is the deploy mechanism the canary train needs anyway.** It was built for the wrong target and is immediately reusable for the right one.

## 3. The standing position

**Production `talaria-log.com` is out of scope for Plan 3.** No deploys, no credentials, no hotfixes. It remains on `20260723b56` and that is now a deliberate state rather than a gap. **B's escalation for production SSH is closed, and no production credential is to be requested or accepted.**

**The canary host is `31.97.192.82`, which is the surface A, B and C have all been working against.**

**The trade-loss fix requires no further deployment work: `journalVouchedFor` was confirmed PRESENT on the canary host in B's `b82` same-session verification last night.** **It has been shipped where it matters since roughly 00:07 today.**

## 4. Rule

**Promoted — `SCOPE-01`: the deployment target is a PO fact, not a Director inference.** **Where a fix ships, and which surface a release is judged on, are stated by the PO and never derived from a Director's reading of user harm.** **A Director may report exposure; a Director may not conclude from exposure that a surface is in scope.**

**Related and worth stating separately, because the failure mode was specifically linguistic: when a PO instruction contains a clause I have to interpret, the interpretation is confirmed before it becomes an order.** **I wrote "read as disruption tolerance, not delete permission" into a ruling, which made my guess look like a finding, and then acted on it for eight hours.**
