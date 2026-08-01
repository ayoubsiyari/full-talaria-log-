# B — SOAK-READY declaration, KILL-04 executed, and the unwired fix I almost shipped into the seal

**Manager B — 2026-08-01 10:15 — against RULING-FULL-ROSTER-BEFORE-SEAL §2 (KILL-04) and §3 (SOAK-01)**

---

## 1 · The thing worth reading first: PROC-3 caught me, and it caught me on my own row

I added HYG-1's script tag to `chart v 1.4/chart/dist-v9/index.html`. That file is a **Vite output** —
`vite.config.live.js` sets `outDir: ../chart/dist-v9` with `emptyOutDir: true`. The cut regenerates the
directory from `talaria-design/live/index.html` and **deletes my tag.**

So HYG-1 would have entered the seal:

- **present** — module committed, both mirrors byte-identical
- **mirrored** — verified by hash
- **tested** — 26 behavioural cases green
- **discriminating** — switch-off arm asserted
- **and never loaded by the shipped page.**

Four axes green and the fix inert. That is §1's defect class exactly, produced by the manager who read
the ruling an hour earlier, on the row he was about to declare ready. I am reporting it in full rather
than quietly fixing it, because it is the strongest available argument that PROC-3 is a seal
precondition and not a formality. The fix is in `live/index.html` now, the build source, and my PROC-3
check asserts the **build source** rather than the artefact so this cannot recur silently.

**A second one caught by the same discipline.** My LIFE-3 behavioural gate went RED on my own fix: the
bfcache re-claim never issued a request, because `claim()` returns the pending promise when one is
in flight and my restore path reused a promise that had settled against a server state that no longer
existed. Reading the code, it looked right. Running it, it did nothing. Fixed by clearing the dedupe
before the restore claim.

Two unwired-or-inert defects on two rows, both found by gates written this morning, neither findable by
inspection. I would treat that hit rate as the argument for E's sweep covering everything, not just the
rows anyone is suspicious of.

---

## 2 · KILL-04 — source maps, killed rather than investigated

§2 converts the source-map check from "one look" to "kill". I had already looked, yesterday, at the
served b120 bundle and found nothing. **That answer was correct and useless**, because "no maps in
today's artefact" is not the property we want. The property we want is "maps cannot ship".

Pinned explicitly in all four build paths that emit something served:

| Config | Emits | Pin |
|---|---|---|
| `talaria-design/vite.config.live.js` | `chart/dist-v9` — the live chart shell | `sourcemap: false` |
| `talaria-design/vite.config.js` | `homepage/public/talaria-v8b-design` | `sourcemap: false` |
| `homepage/next.config.mjs` | the homepage export | `productionBrowserSourceMaps: false` |
| `chart/scripts/build-chart-client-bundle.mjs` | legacy `chart/dist` | `sourceMap: false` — already present |

Three of the four were relying on a framework default. Defaults are not commitments: one Vite major, one
inherited config, or one debugging session that forgets to revert, and the unminified source ships.

**Gate:** `_evidence/manager-B/kill04-sourcemaps/kill04-no-source-maps.mjs` — 10 green across config,
artefact and self-test axes. It is **discriminating by construction**: `--self-test` builds a synthetic
bundle carrying both a `.map` file and an inline base64 map, and asserts the gate goes RED on it.

Two reference trees under `Sources Handoff/prototype_reference*` also contain Vite configs. They are not
built and not served, so I left them and am naming them rather than silently excluding them.

---

## 3 · SOAK-READY declaration against the six conditions

**I declare NOT-YET-SOAK-READY, on conditions 1 and 2. Conditions 3, 4, 5 and 6 are met.**

| # | Condition | State |
|---|---|---|
| 1 | Every roster row I own is committed **and merged into B's train** | **NOT MET** — see §3.1 |
| 2 | Every switch named per the reservation table, default declared | **NOT MET** — one switch is mine and not on the roster; see §3.2 |
| 3 | Gates green **and discriminating** | **MET** — LIFE-3 17/17, HYG-1 26/26, KILL-04 10/10, each with an explicit RED-on-defective-input case |
| 4 | Worktree clean | **MET** as of this commit |
| 5 | Nothing in flight writing to a product file | **MET** |
| 6 | PROC-3 on my own rows | **MET** — 23/23 green on present / bound / mirrored / discriminating |

### 3.1 · Condition 1 cannot be met by me alone, and the protocol should say so

My two rows are committed and pushed. "Merged into B's train" is a different claim, and **I am the one
who performs the merge.** The train does not exist yet because A's nine rows, E's two, and D's two have
not been delivered. So my condition 1 resolves only after everyone else's condition 1 does.

More structurally: **§3 says a manager declaring SOAK-READY goes idle and stays idle, but §4 has B
cutting and deploying after all five declarations.** B cannot both go idle and perform the last action
before quiescence. I read my state as **"ready except for the cut"**, and I will hold the cut until the
Director names it. If that is not the intent, the protocol needs a sixth state for the cutting manager,
because as written B is the one manager who cannot honour it.

### 3.2 · Condition 2 — my switches, with one addition to declare

| Switch | Row | Default | Surface | On roster? |
|---|---|---|---|---|
| `__TALARIA_BFCACHE_DEFEAT_V1` | LIFE-3 | **ON**; `=== false` disables | client, `window` | yes, exact name |
| `__TALARIA_SETTINGS_WRITE_BREAKER_V1` | HYG-1 | **ON**; `=== false` disables | client, `window` | yes, exact name |
| `TALARIA_DISABLE_BFCACHE_DEFEAT_V1` | LIFE-3 | **unset = fix ON** | **server env** | **no — declaring it now** |

The third is an addition. LIFE-3's primary mechanism is a response header, which no client-side global
can reach, so the server half needs its own lever. I made it env-driven rather than code-driven so the
OFF arm of the post-soak attribution pass can be flipped through `.env` without a rebuild — which
matters more than usual now that §3 forbids rebuilding once C fires. It follows the existing
`TALARIA_DISABLE_*` vocabulary (`1|true|yes|on`), and I verified that parsing across six values rather
than reading it.

**If the Director wants the roster to carry exactly one switch per row, say so and I will fold the
server half behind a config read of the same client-facing name.** I would rather be told than assume.

---

## 4 · Sequencing, and the one thing I need before the cut

I have read the constraint and it is the binding one for me: **once C fires I may not cut a build**, and
the harness re-verifies the served digest every sample and will void a ten-hour run.

**My commitment: I do not cut again until the Director names the cut.** The canary is on b120 and stays
there. Nothing I have done today touches the deployed build; every gate above runs against source, so
none of it required a deploy and none of it will require one before the seal.

**What I need at the cut, stated now so it is not discovered at the moment it blocks:**

1. **The cut is a real build**, not a file copy — `npm run build:live` regenerates `dist-v9`. That is
   what makes the `live/index.html` fix above load-bearing, and it is why the passport digest must be
   taken **after** the build, from the served artefact, not from the tree.
2. **The passport carries badge + digest.** I read digest as the hash of what is actually served, so
   C's per-sample re-verification compares like with like. If C's harness digests something else — the
   image ID, a manifest, the shell only — I need to know which, before the cut, because a mismatch voids
   the run at sample one rather than at hour ten.
3. **One quiescence check immediately before the cut**, since a build during someone else's gate run is
   the same class of accident in the other direction.

---

## 5 · Host attribution

Nothing in this document is a performance number. The one measured fact is the pre-LIFE-3 cache header,
taken on **canary `31.97.192.82`, software rasteriser (SwiftShader), no GPU** — not C's
`ANGLE (NVIDIA, RTX 4060 Laptop GPU, Direct3D11)`. My note at 10:30 on being unable to comply with
"all wave measurement pins to C's host" still stands and still needs a decision.
