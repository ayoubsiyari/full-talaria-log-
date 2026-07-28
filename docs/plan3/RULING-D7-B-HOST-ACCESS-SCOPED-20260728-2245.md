# PO DECISION D-7 — B is granted host access to deploy and verify end to end. Accepted, and scoped to least privilege. TEST host only, no database credentials, every host command journaled before execution, and a restore point before the first deploy. The reason for the database exclusion is documented, not hypothetical.

**2026-07-28 22:45.**

---

## 1. The decision and why it is the right one

**PO ruling D-7: grant B host access so it can build, deploy and verify without a human in the loop.**

**Correct, and it removes the longest pole.** A verification loop that requires a human relay is a loop we will run once or twice, badly, at midnight. **B already owns delivery, built the census, the deploy gate and the post-push runbook; giving it the surface those instruments were built for closes the gap between "verified in the artifact" and "verified on the host" — which is precisely the gap that produced tonight's two worst errors.**

## 2. Scope of the grant — least privilege, and one exclusion that is not theoretical

**GRANTED:**

- **SSH to the TEST host `31.97.192.82` only**, as a **non-root** user with permission to run the container tooling in the application directory.
- **Build, deploy, restart and probe.** Everything in the post-push runbook.

**WITHHELD, explicitly:**

- **Production credentials of any kind.** Not in an env file, not in a config B can read, not in a comment. **PO ruling D-5 is that production receives a single push at the end, and that push is not B's to make tonight.** Nothing B can reach should be able to touch `talaria-log.com`.
- **Database credentials.** **B deploys the application; B does not administer the data store.**

**The database exclusion has a specific, documented cause and I am recording it rather than implying it.** `HARNESS-01` exists because **B's own trade-verification harness destroyed real trades while printing PASS.** That was caught, corrected, and B has behaved impeccably since — tonight it stopped three of my errors. **But a manager whose tooling has once deleted live records does not get credentials to the record store on the same day we are shipping a fix for record deletion.** That is not distrust of B's judgement; it is refusing to concentrate two failure modes in one place.

## 3. Obligations on B, required before the first host command

**1. Journal before execution, not after.** Every command run against the host is written to the journal **first** — the command verbatim, the reason, and the expected effect. **A host action that appears in the journal only after it ran is a violation, because the value of the record is that it exists before the irreversible thing happens.**

**2. A restore point before the first deploy.** Capture whatever is needed to put the host back as it is now — current image tag, current container state, current nginx config. **The first deploy must be undoable without asking anyone anything.**

**3. A refusal list B commits to in writing.** No `rm -rf`, no volume deletion, no `docker system prune -a` (there are 114 images on that machine and some are other people's), no database drop, truncate or migration, no credential file edits, and **nothing at all against any host other than `31.97.192.82`.** If a task appears to require any of these, **B stops and escalates rather than reasoning its way to an exception.**

**4. Post-deploy verification is not optional and not deferred.** `deroute-multichart-acceptance.mjs`, `live-surface-probe --deploy-gate`, and the stamp census run immediately after the deploy, in the same session, with results journaled.

## 4. What the PO needs to provide

**An SSH credential for a non-root user on `31.97.192.82` with container-tooling permission in the app directory** — a key is preferable to a password.

**And a confirmation of one thing I cannot check from here: whether that test host shares a database, volume, or any credential with production.** **If it shares anything, tell me before B connects, because the scope above assumes isolation and the whole grant depends on it.**

## 5. What this unblocks

**Everything except A's switch sweep.** The train is assembled at `20260728b82`, gates green, hand-off no longer needed as a relay — **B builds, deploys, and runs the post-push checks itself, and the FastAPI de-route acceptance that was unsatisfiable an hour ago becomes satisfiable in the same session as the deploy.**

## 6. One standing consequence

**With host access, B becomes the first agent in this structure able to cause an irreversible external effect.** Every other manager writes to branches, which are recoverable.

**So the escalation bar drops for B specifically: where A and C should attempt and report, B should ask when an action is irreversible and unplanned.** Tonight B held a push against my own ratified assembly and held a 404 against my instruction. **That instinct is exactly the one this grant needs, and it is the reason I am comfortable with the decision.**
