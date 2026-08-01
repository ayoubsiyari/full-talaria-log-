# STAGED — the two sealed soak commands, one blank each

**C, 2026-08-01 13:30.** Everything fixed except `--expectDigest`. Do not run yet.

---

## The two commands

Both go through `scripts/fire-sealed-soak.mjs`, which launches detached, applies the heap cap to the
child, waits for a heartbeat before claiming success, and refuses to stack the arms.

**Arm 1 — trades (20 closes/h):**

```
node --max-old-space-size=1024 scripts/fire-sealed-soak.mjs --arm=trades --expectDigest=<BLANK>
```

**Arm 2 — zero trades:**

```
node --max-old-space-size=1024 scripts/fire-sealed-soak.mjs --arm=zerotrade --expectDigest=<BLANK>
```

That is the whole staged surface. Every other parameter is pinned inside the launcher so it cannot drift
between arms: 10 hours, speed 60, origin `http://31.97.192.82:3000`, 3-minute sampling, heap cap 1,024 MB,
`--requireSha=1`. The two arms differ in exactly one variable, `closesPerHour` 20 versus 0, which is the
whole point of running them as a pair.

## Three things that will stop these commands, all deliberately

| Exit | Meaning |
|---|---|
| 2 | digest blank, or wrong arm name, or the other arm is still live |
| 2 (child) | served bytes do not match `--expectDigest` |
| 3 (child) | source commit SHA unreadable — PASSPORT-3 |
| 4 (child) | heap cap not applied — TOOL-01 |

Both launcher refusals are exercised, not assumed: blank digest and bad arm name each return 2 today.

## THE BLOCKER, and it is not the digest

`--requireSha=1` reads the source commit from `/chart/build-info.json` at launch and refuses if it cannot.
**That route does not serve JSON today.** As of 13:20 the origin returns HTTP 200 with 29,406 bytes of
app-shell HTML — the SPA fallback swallows the path. Under the staged command the soak refuses at exit 3.

So the fire condition is not "B seals" alone. It is **B's cut must also serve `build-info.json` as JSON**.
PASSPORT-3 is present in B's source and unwired on the wire, and the contract half is already verified
against B's own emitter (9/9, SHA recovered intact) — only the front door is missing. If B's cut lands and
the route still falls through to the shell, the soak will not start, and that is the harness working.

The moment B cuts, `node scripts/passport3-verify.mjs --mode=live` witnesses the transition rather than
inferring it.

## Sequencing

The arms run **one after the other**. B measured the host near 85% CPU with a single arm up; two
concurrent arms make each the other's contention, which is the exact defect that marked segment 2 of the
salvaged soak as unpoolable. The launcher enforces this by reading the other arm's heartbeat and refusing
while it is live. Twenty hours of wall clock for the pair — flagging that now, because it is a scheduling
decision rather than a technical one, and it is yours.

## One standing risk, already declared

The harness re-verifies the served digest **and** the source commit on every sample, and stops the run on
drift. A build cut at hour eight destroys eight hours. That is the intended trade — a series spanning two
builds is worse than no series — but it is the third time it is worth saying out loud.
