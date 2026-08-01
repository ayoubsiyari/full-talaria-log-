# Conflict-resolution rehearsal — B+C+A dry merge · 2026-07-28 17:26

**Stream 1 (PAR-01).** Scratch worktree only; nothing pushed. Branch tip left at
`$TEMP/b-release-rehearsal` for inspection; product tree on `manager-b/plan3-20260727`
untouched by the merge commits.

---

## 1. B ← C (`manager-c/verification-infra`)

| File | Result | Resolution |
|---|---|---|
| `chart v 1.4/chart/api_server.py` | **CLEAN auto-merge** | Confirms the released deconfliction (B 12356–12522 / C ~26922). |
| `scripts/checkpoint-provenance.mjs` | **CONFLICT** | Took **C in full**. Resolved blob `59573bac…` == C tip. Diff vs B's `51b6e0da1` (`d8ddfb3d…`) is exactly C's module-contract preflight (+6 lines: import + `validateModuleContracts` in `commandPreflight`). **Rule verified — no hand-merge.** |
| `scripts/lib/checkpoint-provenance.mjs` | **CLEAN auto-merge** | C's legacy de-route: drops `legacy-index.html` from forced mirror list; cache-id check becomes exists-gated; runtime expects `legacyStatus: 404` instead of a build id. |
| `docs/plan3/journal/MANAGER-B.md` | **CONFLICT (add/add)** | Took **B (ours)** per journal-integrity ruling. |

Merge commit in scratch: `rehearsal: merge C; resolve stamper=C, journal=B`.

---

## 2. (B+C) ← A — product clean, docs conflict

Dry-run of both `manager-a/orphan-replay-destroy` and `manager-a/critical-path`
onto the B+C tip produced the **same three conflicts, all under `docs/`**:

- `docs/plan3/DIRECTOR-RULINGS-20260727.md` (add/add)
- `docs/plan3/FINDING-COMPLETED-BAR-CLOSE-MUTATION-20260727.md` (add/add)
- `docs/plan3/journal/MANAGER-A.md` (add/add)

**No product-file conflict** with either A branch. Abort after each dry-run; not committed.

### Resolution rules for the A merge (fixed in advance)

| File | Rule |
|---|---|
| `docs/plan3/journal/MANAGER-A.md` | **A's side, always** (owner). Symmetric to B's journal rule. |
| `docs/plan3/journal/MANAGER-B.md` | Already B; A must not rewrite it. |
| `docs/plan3/DIRECTOR-RULINGS-20260727.md` | **Director-owned.** Do not pick a manager side by habit. Escalate if the two sides diverge in substance; if one is a strict superset, take the superset and journal the choice. |
| `docs/plan3/FINDING-*.md` | Prefer the author's tip for that finding; if both touched, concatenate rather than drop. |

---

## 3. Release-plan impact from C's legacy de-route

C's auto-merged lib change makes the stamper expect **`legacyStatus: 404`**, not a
stamped `legacy-index.html`. That is the intentional de-route.

**Post-push probe criterion 5.3 must change:** do **not** require
`/chart/legacy-index.html` to report `20260728b81`. Accept either:

- HTTP 404 / UNDETERMINED-as-absent-by-design for legacy, **or**
- PRESENT only if the de-route has not yet landed on that surface.

The three shells that must agree on b81 remain: `dist-v9/index.html`,
`multichart-prod/chart-embed.html`, and (with cookie) the auth-gated
`/chart/index.html` → dist-v9. Update applied in `ASSEMBLY-AND-VERIFICATION-PLAN.md` §5.

---

## 4. Still blocking final assembly

A's **render kill-switch** is not on any A tip checked at 17:26 (critical-path,
m27-engine-release, orphan-replay-destroy, indicator-lag-data-effect). Train merge
order stands; item 4 waits. Rehearsal proves B+C and (B+C)+A **product** merges are
ready the hour the switch lands.
