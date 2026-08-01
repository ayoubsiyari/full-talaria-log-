# Live-surface probe — what does the running system actually serve?

**One command. Read-only. Safe to point at production.**

```bash
node live-surface-probe.mjs --base-url=https://<production-host>
```

**Post-push deploy gate (PO one-command, DEPLOY-01 teeth):**

```bash
node live-surface-probe.mjs --base-url=https://<production-host> --deploy-gate --out=./probe-evidence
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

Census 2026-07-28 also showed two deploy hazards the marker alone cannot catch:

1. **Inert `?v=`** — identical asset bytes served under every query string (stamp is a
   cache key only).
2. **Shell stamp incoherence** — e.g. `/chart/talaria-design/live/` advertising an
   older build id than `dist-v9` while sharing `/chart/modules/*`.

`--deploy-gate` fails closed on both.

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

**`stampInert` is a separate deploy hazard.** Dual-`?v=` fetch: if both return 200
with byte-identical bodies (sha256 match), the report sets `stampInert: true`. That
never rewrites the guard marker between ABSENT and PRESENT.

Exit codes:

| Code | Meaning |
|---|---|
| `0` | everything PRESENT (and deploy-gate hazards cleared, if enabled) |
| `1` | something ABSENT — the surface lacks the fix |
| `2` | **deploy-gate failure** — inert `?v=` and/or incoherent 200 shells |
| `3` | something UNDETERMINED — we could not tell you |
| `64` | the probe could not run (bad arguments / EVID-01 collision) |

## Options

| Flag | Default |
|---|---|
| `--base-url=URL` | **required** |
| `--module=PATH` | `/chart/modules/order-manager.js`, repeatable |
| `--marker=STRING` | `journalVouchedFor`, repeatable |
| `--shell=PATH` | `dist-v9`, `legacy-index`, `multichart-prod` embed, **`talaria-design/live`**, repeatable |
| `--session-id=ID` | probe `GET /api/sessions/{ID}` |
| `--token=TOKEN` | or env `LIVE_PROBE_TOKEN`. **Never printed**. |
| `--cookie=COOKIE` | or env `LIVE_PROBE_COOKIE`. **Never printed**. |
| `--out=DIR` | write an immutable JSON record (EVID-01) |
| `--json` | machine-readable output only |
| `--deploy-gate` | post-push gate (see below) |
| `--waive-stamp-inert` | allow `stampInert:true` under `--deploy-gate` (explicit only) |
| `--no-stamp-inert-check` | skip dual-`?v=` check (default: on) |

### Default shells

```
/chart/dist-v9/index.html
/chart/legacy-index.html
/chart/multichart-prod/chart-embed.html
/chart/talaria-design/live/index.html
```

Auth-gated shells (307 → login) and legacy 404s are **ignored for coherence** so they
cannot poison agreement among shells that actually returned stamped HTML.

## `--deploy-gate` (post-push)

Requires all of:

1. Module identified and required markers **PRESENT**
2. Shells that returned **200** agree on one build id (307 auth gates and 404 legacy ignored)
3. `stampInert` is **false**, unless `--waive-stamp-inert`

Exit **0** only if all pass. Exit **1** if a marker is ABSENT. Exit **2** for inert
stamp / incoherent 200 shells. Exit **3** for transport/auth UNDETERMINED (including
no stamped 200 shell to judge).

```bash
# PO one-command after push
node docs/plan3/evidence/B-M4/live-surface-probe/live-surface-probe.mjs \
  --base-url=https://<host> \
  --deploy-gate \
  --out=docs/plan3/evidence/B-M4/live-surface-probe/observations
```

## For the D-2 hotfix specifically

```bash
node live-surface-probe.mjs --base-url=https://<host> --deploy-gate --out=./probe-evidence
```

Then read the verdict / exit code:

- **exit 0 / `PRESENT`** — served module carries the guard, 200 shells agree, stamp selects bytes.
- **exit 1 / `ABSENT`** — correct identity, marker missing. **Do not tell testers they are protected.**
- **exit 2** — markers may look fine but deploy hazard (inert `?v=` or incoherent shells).
- **exit 3 / `UNDETERMINED`** — not enough signal; read the reason (path, auth, transport).

## What it does not do

- It does not tell you whether a **specific user's** browser holds a stale copy. It
  reports what the edge returns now, including `cf-cache-status` and `age`.
- It does not authenticate for you. Without `--token` / `--cookie`, gated shells stay
  UNDETERMINED (auth gate messaging) and are ignored for coherence.
- It does not prove the build id is correct, only what the surface reports.
- Redirects use `redirect: manual` — never followed into a login page.
