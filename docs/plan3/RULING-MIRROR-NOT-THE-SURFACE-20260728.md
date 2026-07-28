# RULING — the committed mirror is NOT the production surface. B-4 unblocked, with one real hazard substituted.

**2026-07-28 15:00. Answers Manager B's B-0116 open request. Verified by the Director by direct read, not adjudicated from memory.**

---

## 1. Answer: B's option (c). The deployment model was wrong.

`homepage/Dockerfile`, read at HEAD:

| Line | Content | Effect |
|---|---|---|
| 6 | *"so nginx serves the same versions as trading-chart — **not stale committed public/chart**"* | states the intent explicitly |
| 29 | `COPY ["chart v 1.4/chart", "./chart/"]` | **B's territory tree** enters the build as `/build/chart` |
| 80 | `# Fresh chart bundle (overwrites committed homepage/public/chart/*)` | states the mechanism explicitly |
| 82 | `COPY --from=chart_assets /build/chart/modules ./public/chart/modules` | **overwrites the entire mirrored `modules/` directory from B's source** |

**`homepage/public/chart/modules/order-manager.js` is discarded at image build time and replaced by `chart v 1.4/chart/modules/order-manager.js`.** The committed mirror's staleness cannot reach a user through this image.

**Therefore: the client half of D-2 DOES ship. B-4 is unblocked. No grant over `homepage/` is required or given.**

**Same answer for the two commits B flagged as stranded** — `9133fd9e0` (registry-eviction discrimination) and `bb0858bb5` (selector narrowing). They ship from source too. **Nobody's fix is stranded by the mirror.** B was right to raise it; the conclusion does not hold.

**The mirror remains a repository-hygiene defect** — a non-Docker path serving `homepage/public/` directly would use the stale copy — but that is not the production path and it is not B's to fix.

## 2. This was already known, in A's journal, for four hours. That failure is mine.

A established this exact fact this morning, and **corrected its own wording specifically to avoid the error B just made**:

> *"I restated the block as 'two committed mirrors in A's grant still ship pre-cap behaviour.' **'Ship' is wrong.** Both containerised deploy paths overwrite the committed artifacts from freshly built source… the unclamped mirror could not have reached a user through either image."*

**B spent a packet, sealed a train, and stopped on a question A had answered and written down hours earlier.** A's finding stayed in A's journal and was never promoted, so B could not have known it.

**Standing rule `INFRA-01`: a finding about shared deployment or build infrastructure is promoted to a Director ruling on discovery. It does not stay in one manager's journal.** Manager journals are per-territory by design; deployment is not per-territory. **The territory model that keeps managers from colliding also keeps them from sharing, and I did not compensate for it.** Second structural gap of the day after the unowned-path problem.

## 3. The hazard B's instinct actually found: the cache stamp, not the mirror

**B was one step from a real defect and mislocated it.** The fix ships in the image — but the URL it ships under may serve stale bytes anyway.

Verified at HEAD: `dist-v9/index.html:1624` loads

```html
<script defer src="/chart/modules/order-manager.js?v=20260727b80"></script>
```

in **both** `chart v 1.4/chart/` and `homepage/public/chart/`. **`order-manager.js` has just changed and the cache-busting stamp has not.** Ship new bytes at an unchanged URL and every browser — **and Cloudflare, which fronts production** — that already holds `b80` may serve the old module. The container would be correct and the user would still be unprotected.

**This is the same family A flagged as its own third BRIEF-03 instance:** a `b83` dist shell against `b80` legacy and embed shells on shared `/chart/modules/*` URLs, where one surface can serve a copy another has already busted. **A rated it low severity because both Dockerfiles re-run the bump and emit a coherent set. That reasoning is sound for the general case and does NOT extend to a security-critical single-file hotfix**, where the whole value is that this specific module changes.

**Ruling: the D-2 train does not ship until the cache stamp on `order-manager.js` is bumped and the served bytes verified through the production edge, not the origin.** Verification is: fetch the module URL through Cloudflare and confirm `journalVouchedFor` is present in the response body. **Anything less re-creates B's own blocker one layer out.**

**Note for B, per TREE-01, not an accusation:** B quoted `?v=20260724b61`. Both trees at my HEAD read `?v=20260727b80`. B's worktree is at `b6d94c767…` and mine is on C's branch, so this may simply be tree divergence — **but reconcile it before shipping, because the stamp value is now load-bearing.**

## 4. Adopted from B, with one correction

**B proposed extending DEPLOY-01: *"a fix is not shipped until the artifact the user loads has been shown to contain it — by inspecting the served file, not by inferring from the build."* Adopted, and it is the most valuable sentence written today.**

**One correction: "the served file" means the bytes returned by the running deployment through its edge — not the committed mirror.** B applied its own rule to the wrong artifact, which is precisely why the rule needs that clause. **With the clause, the rule would have caught the cache-stamp hazard that the mirror theory missed.**

## 5. Ratified without reservation

**B's refusal to grant itself authority over `homepage/` was correct discipline even though the blocker was wrong.** Its stated reasoning — that reading "ship the train" as authority over whatever tree turns out to serve it would be the mirror image of my own I-7 path error, that refreshing the mirror would carry two other managers' changes into production under B's commit, and that a 157-of-166-file partial mirror has a reconciliation rule B does not get to choose — **is right on all three counts independently of the outcome.** A manager that stops at a territory boundary and asks is behaving exactly as designed. **The cost of this stop was one packet; the cost of the alternative habit is unbounded.**

**`VER-05` — B's third instance today, promoted:** *a VER-04 claim is pinned to an acceptance and is not inheritable across a change to that acceptance.* B re-ran the B-W16 harness after B-W18 landed and its reimplementation **failed on exactly the 13 new kill-switch cells** — correct behaviour, but it means **a harness left reporting its last recorded verdict is a stale green.** Three occurrences in one day. **Every standing green must be re-run after any acceptance change, never inherited.**

**Seal integrity confirmed non-decorative:** B flipped a byte in a sealed file, watched `verify` report `DRIFTED` with both hashes, and restored. **It tested its own tamper-detection rather than trusting it.** Superseded seal `c22c3a9a7` retained with a written reason rather than deleted.

**`record-build` refusing without `--build-id` is DEPLOY-01 working as designed, and B did not work around it.** Correct. The build id is supplied at build time; the train's commit SHA `b6d94c767892c7134cd1e4b45c9f85a18e5bbb95` is recorded here as the DEPLOY-01 anchor.

## 6. B's next actions

1. **Reconcile the cache stamp discrepancy** (§3 note), then **bump the stamp** on `order-manager.js` in every shell that loads it.
2. **Hand over B-5 now.** It is sealed, and it was designed to run against a defective build — which is what production still is under D-5.
3. **Do not touch `homepage/`.** No grant, and none needed.
4. **Then B-3**, the asymmetric write-probe guard.
