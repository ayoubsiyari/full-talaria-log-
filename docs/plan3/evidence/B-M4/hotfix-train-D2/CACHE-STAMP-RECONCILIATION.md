# Cache-stamp reconciliation for the D-2 hotfix train

**Answers §3 and §6.1 of `RULING-MIRROR-NOT-THE-SURFACE-20260728.md`.** Ruling
verified in my own worktree first: the `homepage/Dockerfile` COPY chain is at **L27**
(`COPY ["chart v 1.4/chart", "./chart/"]`) and **L79**
(`COPY --from=chart_assets /build/chart/modules ./public/chart/modules`) here, versus
L29/L82 quoted — same mechanism, line offsets consistent with the tree divergence
below. **The ruling holds and my mirror blocker was wrong.**

---

## 1. The divergence is real, and it is my whole tree, not one file

Every shell in my worktree reads `b61`; the Director's HEAD reads `b80`.

| Shell | My tree | Owner |
|---|---|---|
| `chart v 1.4/chart/dist-v9/index.html` | `20260724b61` | **A** |
| `chart v 1.4/chart/legacy-index.html` | `20260724b61` | **A** |
| `chart v 1.4/talaria-design/live/index.html` | `20260724b61` | **A** |
| `homepage/public/chart/dist-v9/index.html` | `20260724b61` | **A** |
| `homepage/public/chart/legacy-index.html` | `20260724b61` | **A** |
| `homepage/public/chart/talaria-design/live/index.html` | `20260723b12` | **A** |

`20260727b80` **does exist** in my repo's history under `--all` (introduced around
`b96ad1bba`, `501fe23fb`), so this is ordinary branch divergence: I am on
`manager-b/plan3-20260727` at `38ba0a5d1`, the Director is on C's branch. **Not a
misread on either side.** The highest stamp reachable in my checked-out tree is
`20260726b70`.

## 2. Why the divergence is dangerous, which is worse than the ruling assumed

`bump-dist-v9-cache.mjs:73` resolves the build id as:

```js
function resolveBuildId(html) {
  if (process.env.BUILD_ID?.trim()) return process.env.BUILD_ID.trim();
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 10);
  const current = readCurrentChartBuildId(html);   // <— the COMMITTED stamp
  if (current) return incrementBuildId(current);   // <— +1 from it
  return defaultBuildId();
}
```

**The committed stamp is the base for the auto-increment.** So a build of my branch
without `BUILD_ID` set resolves `b61 → b62`.

**`b62` is lower than the `b80` production has already served.** That is not merely a
failed cache-bust; it is a stamp from the past. A browser or Cloudflare edge holding
anything in the `b62`–`b80` range keeps serving a module that predates the guard,
and the URL gives no signal that it is stale. **An ordinary build of this hotfix
would ship the fix and hide it behind a regressed cache key.**

## 3. The resolution needs no source edit, and touches nobody's territory

`homepage/Dockerfile` L17 sets `ENV BUILD_ID=${CHART_BUILD_ID}`, and `resolveBuildId`
consults `BUILD_ID` **before** the committed-stamp path. So passing the build id as a
build arg overrides the divergent committed value entirely, inside the image, from
source:

```
docker compose build \
  --build-arg CHECKPOINT_BUILD=1 \
  --build-arg CHART_BUILD_ID=20260728b81 \
  --build-arg SOURCE_COMMIT_SHA=b6d94c767892c7134cd1e4b45c9f85a18e5bbb95 \
  homepage trading-chart
```

**`20260728b81`** is proposed because it is strictly ahead of `b80` on both the date
field and the sequence field, and it is confirmed **unused anywhere in `--all`
history**, so it cannot collide with anything a cache may already hold.

This also satisfies DEPLOY-01 in the same command rather than as a separate step:
Dockerfile L35-36 rejects `CHART_BUILD_ID` unless `CHECKPOINT_BUILD=1`, and L30-34
then requires a full 40-character `SOURCE_COMMIT_SHA` and asserts tree layout at
L47-53. **You cannot stamp a build id here without going through the checkpoint
path, which is DEPLOY-01 enforcing itself.**

## 4. What I did not do, and why

**The ruling's instruction was to bump the stamp in every shell that loads
`order-manager.js`. All four such shells are Manager A's territory**, per
`TERRITORY.yml`:

- `chart v 1.4/chart/*.html` → A (`legacy-index.html`)
- `chart v 1.4/chart/dist-v9/**` → A
- `chart v 1.4/chart/multichart-prod/**` → A (`chart-embed.html`)
- `chart v 1.4/talaria-design/**` → A (`live/index.html`)
- `homepage/public/chart/**` → A

**B owns the module; A owns every shell that references it.** There is no shell in
B's territory that loads `order-manager.js`, so the instruction as written cannot be
executed by me without a grant over four of A's files.

I have not taken that grant, for the same reason I did not take `homepage/`: this
would be the third instruction today pointing at a path outside my territory, and
the pattern the I-7.1 ruling established is that I bring back the file list rather
than widen my own authority to fit the instruction.

**I am not asking for the grant, because §3 makes it unnecessary.** The build-arg
path produces the same stamped bytes without editing anyone's source. If the
committed stamps should *also* be reconciled — and they arguably should, since §2
shows the committed value is a live hazard on any non-checkpoint build — **that is
work for A on A's files, and it is A's call.**

## 5. Edge verification — I cannot perform it

The ruling requires the module be fetched **through Cloudflare** and checked for
`journalVouchedFor`. **No production hostname exists anywhere in this repository**;
the only external hosts referenced are third-party CDNs and APIs. I have no edge
URL and no credentials, so this step is not mine to complete and I am not going to
report a substitute check as if it satisfied the requirement — that would be the
origin-versus-edge error the ruling just corrected me on.

For whoever holds edge access, the check is:

```bash
curl -s "https://<production-host>/chart/modules/order-manager.js?v=20260728b81" \
  | grep -c journalVouchedFor          # must be 2, not 0

curl -sI "https://<production-host>/chart/modules/order-manager.js?v=20260728b81" \
  | grep -i "cf-cache-status\|age"     # expect MISS or a fresh age on first fetch
```

Then check the **old** URL, which is the one I would actually worry about:

```bash
curl -s "https://<production-host>/chart/modules/order-manager.js?v=20260724b61" \
  | grep -c journalVouchedFor
```

`chart-embed.html:243` composes its script URLs as
`src + '?v=' + window.__TALARIA_CHART_BUILD_ID`, where that value is
`p.get('v') || '20260724b61'` (line 9) — **an embed opened without a `?v=` parameter
falls back to the hardcoded default and requests the pre-guard URL by name.** That
exact URL is the one most likely to be warm in Cloudflare.

The build-arg path in §3 does cover this: `bump-dist-v9-cache.mjs:260` calls
`bumpChartEmbedHtml(distBuildId)`, which rewrites the embed's default, and L253
bumps `SW_VERSION` in the service worker so a registered worker does not keep
serving its own cached copy. **Both are covered only on the build path, not by
editing any single shell** — another reason §3 is the right mechanism rather than a
hand-bump of the four files.

The residual question the edge check answers is whether any *already-open* embed
session is still pinned to `b61`. That is a client-lifetime problem no build can
fix, and it is the reason the STOP condition in `PO-VERIFICATION.md` matters until
the edge is confirmed clean.
