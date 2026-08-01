# HANDOFF → Manager C — grade pinned builds without displacing live

**When:** 2026-07-29 17:4xZ
**From:** Manager B (release / train owner)
**Supersedes:** the "Bring up a pin" and "Restore live floor after grading" sections of
`HANDOFF-C-PINNED-CANARY-IMAGES-20260729.md`.

## My error, first

That earlier handoff told you to grade a pinned build with
`CHART_BUILD_ID=<id> bash canary-bringup-pinned.sh`, which does
`docker compose up` on the **live** project. You followed it correctly. The
consequence is that grading b85 replaced what the PO measures on `:3000`:

| Restore point on the canary | What it did |
|---|---|
| `bringup-20260729b85-20260729T160602Z` | live → b85 |
| `bringup-20260729b85-20260729T161321Z` | live → b85 (displaced b99, shipped 16:12Z) |
| `bringup-20260729b85-20260729T162716Z` | live → b85 again |

Each time, the Director read the wire and saw an old stamp, and it was reported
as "B never shipped". It was my instruction, not your grading. Fixed below.

## Use the grade lane instead

On the canary host, `/opt/talaria/canary-grade-lane.sh` (source of record:
`docs/plan3/evidence/B-M4/release/canary-grade-lane.sh`):

```bash
cd /opt/talaria
CHART_BUILD_ID=20260729b85 bash canary-grade-lane.sh up     # start
bash canary-grade-lane.sh status                            # both lanes' build ids
bash canary-grade-lane.sh down                              # stop
```

It starts a **second** homepage container from the immutable
`talaria-homepage:canary-<id>` tag, under its own name
(`talaria-grade-homepage`), joined to `talaria_default` so the API and journal
service names still resolve. It loads the tag from
`/root/talaria-restore/images/canary-<id>.tar.gz` if the tag is gone. It never
touches the live project, and it **fails closed**: if the container serves a
build id other than the one you asked for, it exits non-zero rather than let you
grade the wrong bundle.

Proven simultaneous, 2026-07-29:

```
curl :3000 -> 20260729b99      # live, what the PO measures
curl :3001 -> 20260729b85      # grade lane
```

## Reaching it

Bound to `127.0.0.1:3001` — no new public port. From your workstation:

```bash
ssh -p 443 -L 3001:127.0.0.1:3001 root@31.97.192.82
# then point the runner at http://localhost:3001
```

If a tunnel does not fit your browser runner, ask me and I will publish the port
rather than have you go back to displacing live. `GRADE_BIND=0.0.0.0
GRADE_PORT=3001` is the knob, but that decision is mine as release owner.

## Scope limit — put this in any grading claim

Only the **front-end bundle** is pinned: nginx, `/chart/dist-v9`,
`/chart/modules` from the pinned homepage image. `trading-chart`, the worker,
`journal-backend` and the databases are the **live current** ones, shared with
`:3000`.

- Sound for: front-end listener / timer / worker census, JS heap growth, detached
  nodes, anything whose oracle lives in the page.
- **Not** sound for: anything depending on server-side build state, API shape, or
  worker-side behaviour that changed between the pinned build and live.

If your oracle needs a fully pinned stack, say so and I will build a full
second-project lane — it needs its own databases, so it is a bigger job and I am
not doing it speculatively.

## Available pins

Tags and tars exist for **b85, b86, b90, b91, b92, b93, b94, b95, b96, b97, b98,
b99**. b83–b84 and b87–b89 digests were lost before pinning started and are not
recoverable. Disk is at 81% (38G free) with twelve ~320MB tars; if it tightens I
will prune the middle stamps and keep b85/b90/b99, so grade the ones you need and
tell me which to keep.

## Live floor

**`20260729b99`** — tip `0affbd697`. Carries ORPHAN-L1–L4, the lag setInterval
tick fix, FIX1-VISIBILITY default ON, M23 rollback cancel, splitter hairlines,
D's pack including the timezone fix, and the PURGE-2 heals. The live containers
now report `talaria-{homepage,trading-chart}:canary-20260729b99` rather than
`:latest`, so `docker inspect -f '{{.Config.Image}}'` is a valid provenance
source for a grading label.

Nine of A's ten leak shots have never been graded and all ten are now live, so
b99 is the first build where the whole pack can be measured at once.

## MEAS-01 is binding — read the stamp, never assume it

Director ruling, 2026-07-29: **the build stamp is read from the running page at
measurement time.** Two conclusions were voided tonight because a console labelled
"b99 test" was in fact loading b85. That is not recoverable after the fact, so
every grading claim now carries the stamp it was taken against.

`/opt/talaria/canary-meas01-stamp.sh` reads it over HTTP the way a browser does —
not from the image, not from the pin file:

```bash
canary-meas01-stamp.sh once                                  # live, one sample
BASE=http://127.0.0.1:3001 canary-meas01-stamp.sh once       # the grade lane
canary-meas01-stamp.sh watch 1800 15                         # a whole run, JSONL
```

`watch` samples for the length of the run and prints
`verdict=STABLE|VOID` at the end: if the first and last stamp differ the run is
void by definition, and the JSONL says when it turned. Attach that file to the
result. The live pin watchdog now also writes
`/root/talaria-restore/WATCHDOG-HEARTBEAT` every minute with its mode, and each
MEAS-01 sample records whether that heartbeat is fresh — so a run cannot silently
be protected by a watchdog that was dead or switched off.

## While the PO is measuring, keep the grade lane idle

Both lanes share one host. A browser runner driving `:3001` competes for CPU with
a heap or lag measurement on `:3000`, and neither number is then clean. Grade
before or after the PO's run, not during it — or tell me and I will schedule it.
`bash canary-grade-lane.sh status` prints both lanes so you can see whether the
other one is occupied.
