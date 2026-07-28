# RULING — I wrote an unsatisfiable gate. The host de-route check can only pass after deployment, and I made it a pre-push blocker, which deadlocks the push. Splitting it: pre-push conditions are met, the host check becomes post-push, and it does not gate the train.

**2026-07-28 22:35. B correctly reported `Host acceptance FAIL` and correctly blocked itself. The defect is in my criterion, not in B's work.**

---

## 1. The deadlock I created

**My 22:25 requirement:** *"The de-route is not accepted until `/chart/multichart/chart-host.html` fails to serve on `31.97.192.82:3000` — the FastAPI surface — not merely behind nginx."*

**B's report:** *"Host acceptance FAIL as of this writing — `31.97.192.82:3000` still serves chart-host 200 (tip not on that surface; no SSH from this agent). Push blocked until `deroute-multichart-acceptance.mjs` exits 0 on that host after deploy."*

**The route cannot stop serving until the new code is deployed, and I made the deploy conditional on the route having stopped serving.** B did exactly the right thing: implemented, verified what it could, reported the failure honestly, and refused to declare a gate green that was not. **The gate was impossible and B is not the reason it is red.**

## 2. Pre-push conditions — verified met

**Checked on B's tip, which is the authority per TIP-01:**

```
api_server.py:27102  _MOUNT_MULTICHART_SANDBOX = os.environ.get("TALARIA_MOUNT_MULTICHART_SANDBOX", "").strip() == "1"
api_server.py:27107  print("⛔ Multichart sandbox NOT mounted (de-routed; set …=1 to override)")
```

**Default is OFF** — an unset variable is not `"1"`. **And no compose file, Dockerfile, env file or shell script anywhere on B's tip sets that variable**, so default-off survives into the deployed environment. **The nginx 302 is retained, and B's artifact smoke passes.**

**That is everything verifiable before a deploy, and it is all green.**

## 3. Ruling — the host check moves post-push and does not gate the train

**Pre-push, required and satisfied:** mount gated, default off, nothing sets the override, nginx redirect present, artifact smoke green.

**Post-push, required:** `deroute-multichart-acceptance.mjs` exits 0 against `:3000`.

**And a calibration that matters more than the mechanics.** If the post-push check fails, **that is not a rollback trigger and it must not hold the canary.**

**The exposure being de-routed is a months-old CDN reference on a dead prototype route. It is the status quo.** A post-push failure would mean *we did not improve it*, not *we broke something*. **This train contains the fix for a defect that has been silently deleting users' trade journals since 3 July.** Blocking that on an unchanged, unexploited reference to a d3 copy on a prototype page would be a serious misordering of harm, and I want it written down before anyone is tempted by it at 2am.

**If the post-push check fails, it becomes the first item of the follow-up train, alongside the d3 vendored swap already scheduled there.**

## 4. The constraint that now sits on the critical path — nobody in this system can deploy

**B's note: *"no SSH from this agent."***

**So the train is assembled, stamped `20260728b82`, gates green, and no agent in this structure can put it on the host.** **That is a dependency on the PO or on a pipeline, and it is now the longest pole.**

**Ordered for B: produce a single hand-off artifact that someone with host access can execute without interpretation** — the exact image build command with `CHECKPOINT_BUILD=1` and `CHART_BUILD_ID=20260728b82`, the deploy step, and the post-push verification invocation. **Assume the operator will not read the journals.** B's `POST-PUSH-VERIFICATION-RUNBOOK.md` is most of this; it needs the build and deploy half in front of it.

## 5. What remains before the push

**One item: A's pre-push switch round-trip sweep.** Everything else is either green or post-push.

**And then a human has to deploy.**
