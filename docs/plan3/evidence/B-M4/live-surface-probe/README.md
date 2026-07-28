# Live-surface probe — what does the running system actually serve?

**One command. Read-only. Safe to point at production.**

```bash
node live-surface-probe.mjs --base-url=https://<production-host>
```

That is the whole thing. It issues `GET` requests only — the read-only rule is
enforced inside the single function that touches the network, so there is no path
through this tool that writes, and pointing it at production cannot change anything.

---

## Why it exists

DEPLOY-01 says a fix is not shipped until the artifact the user loads is shown to
contain it. Nothing in this repository could show that. **The whole hotfix train
passed 41 acceptance assertions, 15 mutants and both VER-04 halves against source
files, and none of that says a word about what Cloudflare hands a browser.**

## The three states, which are the point

| State | Means |
|---|---|
| `PRESENT` | We hold the bytes, we proved they are the artifact, and the marker is in them. |
| `ABSENT` | We hold the bytes, we proved they are the artifact, and the marker is **not** in them. |
| `UNDETERMINED` | Anything else, with a reason. |

**`ABSENT` is a load-bearing claim** — it means the deployed surface is serving a
build without the fix. The probe only ever says it after establishing independently
that the bytes really are the module, using structural anchors that exist in the
pre-fix build too.

**`UNDETERMINED` is a result, not a failure.** A 404, a 401, a timeout, or an HTML
login page returned with status 200 all land here. The tempting bug is to grep that
login page for the marker, find nothing, and announce that production lost the fix.
That is a manufactured incident, and refusing to manufacture it is most of this
tool's value.

Exit codes let a script tell the three apart without parsing anything:

| Code | Meaning |
|---|---|
| `0` | everything PRESENT |
| `1` | something ABSENT — the surface lacks the fix |
| `3` | something UNDETERMINED — we could not tell you |
| `2` | the probe could not run (bad arguments) |

## Options

| Flag | Default |
|---|---|
| `--base-url=URL` | **required** |
| `--module=PATH` | `/chart/modules/order-manager.js`, repeatable |
| `--marker=STRING` | `journalVouchedFor`, repeatable |
| `--shell=PATH` | the three chart shells, repeatable |
| `--session-id=ID` | probe `GET /api/sessions/{ID}` |
| `--token=TOKEN` | or env `LIVE_PROBE_TOKEN`. **Never printed** — redacted from stdout and from evidence. |
| `--out=DIR` | write an immutable JSON record (EVID-01) |
| `--json` | machine-readable output only |

## For the D-2 hotfix specifically

```bash
node live-surface-probe.mjs --base-url=https://<host> --out=./probe-evidence
```

Then read the verdict:

- **`PRESENT`** — the served module carries the guard. The edge clause is satisfied.
- **`ABSENT`** — correct bytes are built but the edge is serving a cached copy, or
  the build never shipped. **Do not tell testers they are protected.**
- **`UNDETERMINED`** — you have learned nothing about the fix yet. Read the reason;
  it is usually a wrong path or a missing credential, both fixable, and neither is
  evidence about the build.

Also check the `BUILD ID` block. If the shells disagree, one surface can serve a
module another has already cache-busted — that is the failure mode that nearly voided
this train, and the probe reports it as `INCOHERENT`.

## What it does not do

- It does not tell you whether a **specific user's** browser holds a stale copy. It
  reports what the edge returns now, including `cf-cache-status` and `age`.
- It does not authenticate for you. Without `--token`, `GET /api/sessions/{id}` will
  answer `401`, which the probe reports as reachable-but-unread, not as absent.
- It does not prove the build id is correct, only what the surface reports.
