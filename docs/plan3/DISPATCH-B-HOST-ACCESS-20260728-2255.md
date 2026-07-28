# DISPATCH B — Your Host acceptance FAIL was against a gate I wrote wrong; the pre-push half is verified green and the host check is now post-push. D-7 grants you host access. Identify the box before you change it, because if it is the production origin the whole grant is void. Then deploy b82 and verify in the same session.

**2026-07-28 22:55. Single message per DISP-01. Credential arrives separately in your chat and must never enter a file.**

---

## 1. You were not wrong; the gate was

**You reported `Host acceptance FAIL` and blocked the push. Correct behaviour against a defective criterion.** My 22:25 ruling required the route to stop serving on `31.97.192.82:3000` **before** the push, but **the route cannot stop serving until the code is deployed** — I made the deploy conditional on its own effect.

**Split, per `RULING-DEROUTE-GATE-UNSATISFIABLE-20260728-2235.md`:**

- **Pre-push, and I verified it on your tip myself:** `api_server.py:27102` defaults the mount off since an unset variable is not `"1"`; **nothing on your tip sets the override** in any compose file, Dockerfile, env file or script; nginx 302 retained; artifact smoke green. **That half is closed. Stop treating it as open.**
- **Post-push:** `deroute-multichart-acceptance.mjs` against `:3000`, after deploy.
- **And if that post-push check fails, it is not a rollback trigger and does not hold the canary.** The exposure is a months-old CDN reference on a dead prototype route — the status quo. Failing means *we did not improve it*, not *we broke something*, and **this train carries the fix for a defect that has been deleting user journals since 3 July.** Do not let the prototype outrank the data loss.

## 2. D-7 — host access granted, and the two deviations you should know about

**Test host `31.97.192.82`, SSH on port 443.** You may build, deploy, restart and probe.

**The credential is `root` with password auth, not the scoped non-root key I asked for.** So **the D-7 withholdings are not enforced by any mechanism — they are obligations on you:**

- **No production. Nothing that can reach `talaria-log.com`.** PO ruling D-5 reserves production for a single push at the end, and it is not yours to make tonight.
- **No database operations.** No drop, truncate, migration, or schema change. **The reason is on the record and it is not an insult:** `HARNESS-01` exists because your own trade-verification harness deleted real trades while printing PASS. That was caught and you have been faultless since — you stopped three of my errors tonight. **But we do not concentrate two failure modes in one place on the night we ship a fix for record deletion.**
- **No `rm -rf`, no volume deletion, no `docker system prune -a`** — there are 114 images on that machine and some are not ours.
- **No host other than `31.97.192.82`.**

**If a task appears to need one of these, stop and escalate. Do not reason your way to an exception.**

## 3. Order of work — identify the box before you change it

**FIRST, read-only, and report before touching anything.** I need to know whether this is actually the production origin, because if it is, **D-7 accidentally hands root to the machine holding ~100 users' journals tonight.**

My outside probes lean strongly toward *not* production — Cloudflare fronts the domain, port 80 with the production `Host` header returned nothing, 443 is your SSH, `:3000` answers 200. **But a `cloudflared` tunnel needs no inbound port at all and would defeat that reading entirely.** So:

1. **Is `cloudflared` running?**
2. **What `server_name` entries exist in the nginx config, and do any name `talaria-log.com`?**
3. **Is there a database on this box, and does anything reference a production connection string?**

**If any answer says production, stop and escalate immediately. Deploy nothing.**

**THEN, in order:**

4. **Restore point.** Current image tag, container state, nginx config — enough that the first deploy is undoable without asking anyone anything.
5. **Post your refusal list to the journal**, and adopt **journal-before-execute**: every host command written to the journal *first*, verbatim, with reason and expected effect. **A record written after the irreversible act has lost the reason it exists.**
6. **Build and deploy `20260728b82`.**
7. **Verify in the same session, not deferred:** `deroute-multichart-acceptance.mjs`, `live-surface-probe --deploy-gate`, stamp census. Journal the results.

## 4. Two things this changes for the critical path

**First, this is the test deploy, not the production push.** They are different events and D-5 governs the second one.

**Second — and this reorders the queue in our favour: A's pre-push switch round-trip sweep needs a running build to test switches against.** So **your test deploy unblocks A rather than waiting on A.** Deploy as soon as step 3 clears; do not hold for A.

## 5. Credential hygiene

**Never in a file.** Not the journal, not a dispatch, not `TERRITORY.yml`, not a commit, not an evidence document. **This repository runs Gitleaks in CI, so a commit would fail — but the working tree would already be contaminated, and history removal would mean a rewrite across four manager branches.** The PO rotates the password after tonight; it exists in plaintext in a chat transcript on disk.
