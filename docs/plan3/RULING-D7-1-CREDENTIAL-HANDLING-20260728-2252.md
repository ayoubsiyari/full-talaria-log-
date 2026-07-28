# RULING D-7.1 — Credential received is root with password auth, not the scoped non-root key I asked for. It is deliberately not recorded in this repository or any file under it. Rotation is required after tonight because it now exists in plaintext in a chat transcript on disk. Evidence leans strongly that the host is not the production origin, with one scenario that would defeat that.

**2026-07-28 22:52. No credential value appears in this document, in any dispatch, in any journal, or in any commit. That is intentional and permanent.**

---

## 1. Handling — what I did not do with it

**The credential was delivered in chat. It is not written to this repository and will not be.**

**Three reasons, in order of how much they would cost us.** Committing it puts it in git history permanently, where removal requires a history rewrite across four manager branches. **This repository runs Gitleaks in CI**, so the commit would fail loudly — but the working tree would already contain it. And the managers' journals are the artefact we most expect to share.

**Delivery route to B: the PO pastes it directly into B's own chat. Not through me, not through a file, not through TERRITORY.yml or a dispatch.**

## 2. Two deviations from the D-7 scope

**Deviation 1 — it is `root`, where I asked for a non-root deploy user.** Root reaches everything I explicitly withheld in D-7: the data store, credential files, other services on the box, and any production configuration that happens to live there. **The withholdings in D-7 are therefore currently unenforced by anything except B's compliance.**

**Deviation 2 — password authentication, and root login by password is the weakest SSH configuration in common use.** Combined with SSH on 443, which is an ordinary firewall-evasion choice and fine in itself.

## 3. Is this the production machine? Evidence says probably not

**This matters more than the auth mechanism, because if the box serves production then D-7 accidentally grants root on the machine holding ~100 real users' journals, on the night we ship a fix for journal deletion.**

**What I checked, read-only:**

- `talaria-log.com` resolves to Cloudflare addresses (`104.21.26.109`, `172.67.135.239`), so **DNS cannot reveal the origin.**
- A `HEAD` request to `31.97.192.82:80` carrying `Host: talaria-log.com` **returned nothing.**
- `https://31.97.192.82:443` **returned nothing**, which is consistent with the PO's own statement that **443 on this box is SSH**, not HTTPS.
- `http://31.97.192.82:3000` **returns 200** — the test surface, as expected.

**Reading: this looks like a dedicated non-production VPS whose SSH was moved to 443, and it does not appear to serve the production vhost on any conventional port.**

**The scenario that would defeat that reading, stated because I have been wrong three times tonight by treating an unobserved premise as fact:** a **Cloudflare tunnel** (`cloudflared`) needs **no open inbound port at all**, so production could still originate from this machine with nothing visible from outside. **One command settles it once B is on the box — check for a running `cloudflared` process and read the nginx `server_name` entries.** Until then this is a well-supported hypothesis, not a finding.

## 4. Required actions, ordered by value rather than by security aesthetics

**1. Rotate this password after tonight's work — required.** It now exists in plaintext in a chat transcript file on local disk. The exposure is modest, but rotation costs one command and the credential is root.

**2. Never place it in a repository file — required, standing.**

**3. Journal-before-execute, restore point, and the refusal list from D-7 — required, and now carrying more weight.** With root rather than a scoped account, **these are the only real constraint in force.** B commits to them in writing before the first host command.

**4. A separate `talaria-deploy` user with key auth — recommended, not required, and I want to be straight about why the distinction exists.** The deploy user would need membership of the `docker` group to build and restart containers, and **docker group membership is effectively root-equivalent, because the docker socket can mount the host filesystem.** So a deploy user buys a clean audit trail, key auth instead of a password, and protection against *accident* — **it does not buy a real privilege boundary against intent.** Presenting it as least privilege would be theatre, and on a 48-hour deadline I would rather the PO spend the minutes on the switch sweep than on a boundary that does not hold.

## 5. Standing consequence

**With root and password auth, the D-7 withholdings are honour-based.** They were written assuming a mechanism would enforce them.

**I am leaving them in force as obligations on B rather than weakening them to match the credential**, because the reasoning behind the database exclusion — `HARNESS-01`, where B's own harness deleted real trades while printing PASS — **is about concentration of failure modes, and that argument does not become weaker because the key got stronger.**
