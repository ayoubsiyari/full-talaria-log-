# FINDING — B's test deploy succeeded as a hot-patch, which means the reproducible image build has not been exercised and is currently broken in two ways. Under D-5 the production push must be a real `CHECKPOINT_BUILD=1` image. If both blockers are not cleared, forty-eight hours of work produces something we cannot ship.

**2026-07-28 23:20. Raised from a line in B's journal that read as an aside. It is not an aside — it is the largest unowned risk on the board.**

---

## 1. First, what B actually achieved, because it is substantial

**B identified the box before touching it, exactly as ordered, and the verdict is decisive rather than probabilistic.** Hostname `srv904606`; **`cloudflared` inactive with no container and no process** — which closes the one scenario that would have defeated my outside probing; **no host nginx and the homepage container carries `server_name localhost` only**, with no `talaria-log.com` vhost bound; `talaria-log.com` strings present only as source defaults under tooling directories. **And B already knew what I did not: production resolves through Cloudflare to origin `51.20.190.169`, a different machine entirely.**

**Verdict recorded as "NOT production origin. Proceed."** That is the check done properly, and B did it before deploying rather than alongside.

**Then B deployed `20260728b82` and verified in the same session:**

- **`deroute-multichart-acceptance`: PASS, exit 0.** The gate I made unsatisfiable four hours ago is now satisfied.
- **`stamp-census --current=20260728b82`: PASS, exit 0, holes=0.** Product shells, `chart-embed` and `chart.js` all at b82.
- **`live-surface-probe --deploy-gate`: `journalVouchedFor` PRESENT.** **The trade-loss fix is confirmed live on the served surface** — the first time tonight we have observed a fix existing where users would meet it.
- **Restore point at `/root/talaria-restore/20260728b82-pre/`, and the credential never entered the journal, evidence or tree.**

**A is unblocked: `:3000` serves b82 and the switch sweep can run against a real build.**

## 2. The finding — the production build path is broken and untested

**B's deploy was a hot-patch via container recreate, not an image build.** B named the reason in passing: *"Docker checkpoint build still blocked by missing `/scripts/module-contract-preflight.mjs` + soak FixE on tip."*

**That sentence is the problem, because D-5 gives production a single push at the end, and that push must be a `CHECKPOINT_BUILD=1` image.** A hot-patch is acceptable on a test host we can rebuild; **it is not a mechanism for shipping to a hundred users.**

**Blocker one — a missing `COPY`, and I believe it is one line.** `homepage/Dockerfile` copies build tooling in explicitly:

```
24| COPY ["scripts/checkpoint-build-assert.mjs",              "./checkpoint-tools/…"]
25| COPY ["scripts/lib/checkpoint-provenance.mjs",            "./checkpoint-tools/lib/…"]
26| COPY ["scripts/lib/homepage-forwarding-contracts.mjs",    "./checkpoint-tools/lib/…"]
27| COPY ["scripts/lib/homepage-forwarding-contracts.mjs",    "/scripts/lib/…"]
```

**There is no `COPY` for `scripts/module-contract-preflight.mjs`, and the file exists on every manager branch.** So it is present in the repository and absent from the image. **Line 27 is the tell: someone already hit this exact failure with a different file and fixed it by adding a second copy to the absolute `/scripts/` path.** The remedy pattern is already in the file.

**Stated as a hypothesis per `BRIEF-02`, because I have not run the build: refutation cost is one `CHECKPOINT_BUILD=1` build, and B can run it now that it has the host.**

**Blocker two — `soak FixE`, and this one is real work.** Line 42 runs `m19-progressive-session-soak.test.mjs` inside the checkpoint build. **A failing test there fails the image**, and unlike the `COPY` this is not mechanical. **Nobody owns it and nobody has scheduled it.**

## 3. Why this outranks its apparent size

**Every hour tonight has been spent making fixes that are correct, switchable and verified on a test host.** **None of that reaches a user through a hot-patch.**

**The failure mode is specific and it is the worst one available to us:** we arrive at hour forty-eight with lag fixed, memory fixed, the trade eater dead, every gate green — **and discover the only sanctioned route to production does not execute.** At that point there is no time left to repair a build system.

**So the image build stops being infrastructure and becomes a deliverable.**

## 4. Ordered

**B owns both, starting now, ahead of any further probe work.**

1. **Run `CHECKPOINT_BUILD=1` with `CHART_BUILD_ID=20260728b82` and capture the actual failure**, rather than inheriting my reading of the Dockerfile.
2. **If it is the missing `COPY`, add it following the line-27 pattern**, and check whether the preflight pulls further `scripts/lib` dependencies that are equally absent.
3. **`soak FixE`: report the failure verbatim before attempting a fix.** If the soak is failing because of a genuine defect in A's or C's territory, **it comes straight back to me for reassignment rather than being worked around inside the release lane.**

**And the standing consequence, which I want as a rule rather than a note: a fix is not shippable until it has travelled the route it will actually take to production.** Tonight proved a hot-patch can make every gate green while the shipping route remains unexercised. **`DEPLOY-01` required a recorded build ID; it did not require that the build could be built. It does now.**
