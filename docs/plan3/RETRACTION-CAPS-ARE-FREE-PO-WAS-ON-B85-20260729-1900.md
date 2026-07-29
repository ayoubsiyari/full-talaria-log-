# RETRACTION — the PO was served b85, so tonight's performance verdicts are void (2026-07-29 19:00)

B's triage (`beb7b6e47`, 18:08) establishes that during the PO's evening testing **the live stack
was displaced back to b85**, caused by B's own grading handoff. The PO believed they were on b99.

## What this voids

### 1. "The caps are free" — RETRACTED

I concluded at 18:10 that the four hoarding gates could stay on because the PO disabled them and the
diverse-symbol lag persisted. **That experiment proved nothing.** LEAK-F, G, H, I and J were authored
between 13:55 and 14:15; b85 shipped around 12:55. **The code those four flags gate did not exist in
the build the PO was running.** Setting them was a no-op.

The cache-starvation hypothesis the PO proposed is therefore **still open**, not refuted. I closed it
on an experiment that could not have produced a signal either way, and I did so within an hour of
promoting DECL-01, which exists precisely to stop this.

### 2. Any claim about the ten leak shots

The PO's ~12.8 MB/cycle is a **second measurement of b85**, not a measurement of b99. The earlier
b85 run gave ~13.3. The shots remain entirely ungraded. Authored 10, deployed 10, **graded 1** —
unchanged since this afternoon.

### 3. Tonight's lag observations as a verdict on the lag fix

b85 predates LAG-SETINTERVAL-TICK, ORPHAN-L1–L4, FIX1-VISIBILITY, M23 and the splitter fix. Triple
load time, panels loading one by one, replay pausing and jumping, jitter until clicked — all
observed through a 502 retry storm on a pre-fix build. They do not describe b99.

## What survives

- **Measurement reliability.** Two independent PO runs on one build, 13.3 and 12.8 MB/cycle. The
  instrument and the operator are consistent. This is genuinely useful.
- **Storage is not a vector.** 637 kB IndexedDB against a 1,677 MB quota. Build-independent.
- **The one-fault-line synthesis.** Lag conditioned on symbol/TF diversity (b85) alongside memory
  residue conditioned identically (also pre-fix, 01:45). Both observations come from comparable
  pre-fix builds, so the *conditioning* holds even though the absolute numbers do not. Cluster C
  stays promoted.
- **B's 502 root cause.** Not a broken backend: 28 `docker compose up` recreates today, each
  502-ing in-flight requests for 6–10s while `trading-chart` restarts. Post-restore census on the
  current generation: 2032 lines, **502 = 0**, 200 = 2000. Live confirmed on `canary-20260729b99`
  across all three containers.
- **A real latency finding, unrelated to any build.** nginx warns that
  `GET /api/file/25/smart?timeframe=1m&limit=100000&anchor=end` — a 100k-candle response — is
  buffered to a temporary file before the client sees it. Genuine load-time cost. B escalated rather
  than editing, correctly, since nginx tuning is outside its write set. **Currently unowned.**

## Process failures this exposes

**MEAS-01, promoted:** every measurement records the build stamp **read from the running page at the
time of measurement**, not the build the Director believes is deployed. Tonight cost roughly two
hours of PO time and produced three conclusions, two of which were void, entirely because nobody
read the stamp during the run.

**DEPLOY-02, promoted:** a grading or pinning operation must never displace the live wire. B has
already implemented this — `3683ea122` refuses live displacement by default — and root-caused it to
its own handoff, which is the right way to handle it.

## Immediate consequence

The heap test needs re-running on a build confirmed as b99 **from the page itself**, and the
hoarding-flag experiment needs re-running on a build that actually contains LEAK-F through J.
Until then we know nothing about whether ten leak shots did anything.

## Owner for the nginx buffering finding

Not B's write set. Not A's. This is infrastructure and it is a real user-visible load cost on a
100k-candle fetch. Assigning to B anyway with an explicit grant is preferable to leaving it
unowned — the alternative is that it survives to canary because it fell between territories.
