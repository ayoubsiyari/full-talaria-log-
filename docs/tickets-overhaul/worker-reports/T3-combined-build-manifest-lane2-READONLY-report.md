# T3 combined-build manifest (Lane 2) — READ-ONLY report

## 1. Task + RC

- **Task:** `T3-combined-build-manifest-lane2-READONLY.md` — assemble D-018 #4 combined-build manifest (read-only doc + `git log` inspection).
- **RC:** Tooling / planning — **no RC discharge**. Feeds re-migration unfreeze (RC-1 / RC-4) and cross-track staging closure.

---

## 2. What I changed — file by file

| Path | What / why |
|------|------------|
| `docs/tickets-overhaul/T3-COMBINED-BUILD-MANIFEST.md` | **Created** — five sections: landed vs pending commits, kill-switch inventory + P1–P6 one-knob map, staging lineage a1→b2, accumulated PO checklist, open blockers. |
| `docs/tickets-overhaul/worker-reports/T3-combined-build-manifest-lane2-READONLY-report.md` | **Created** — this report per `WORKER-REPORT-STANDARD.md`. |

**No product, harness, or registry files touched.** No other files touched.

---

## 3. Kill-switch (I3 + I13)

**N/A — read-only manifest.** §2 of the manifest inventories all landed and planned switches with gated files and one-knob revert per re-migration phase (D-018 #2). No new switches introduced by this task.

---

## 4. Proof — RED → GREEN

**N/A — documentation only.** Evidence sources:

- `git log` / `git show --stat` on HEAD chain `ba85d960..d6d9822f`
- Worker-report authority for opaque commits (`multi chart`, `phase 2`, `time axis`)
- `MANAGER-FINDINGS.md` PO-confirmed rows (a4 freeze/refresh, a5 TF label)
- `T6-step7-rc5-rc6-closure-sweep-report.md` RC-5/RC-6 appendix
- `T3-REMIGRATION-PLAN.md` phase switches

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| READ-ONLY guardrail | No product/harness/registry edits |
| D-018 #4 | Manifest states one combined build + no append-after-cut |
| I3/I13 | Full switch inventory with per-phase revert map |
| I8 | Noted Manager must coordinate single canonical bump (serve `b2` vs `chart.js` `a4` drift) |
| Lane isolation | Did not edit Lane 4 `known-failing.json` or `scenarios.mjs` |

---

## 6. What I did NOT do / limits

- **Did not commit** manifest files (awaiting Manager intake unless user requests commit).
- **Unclassified / fragmented commits:** T1 steps 14–19 and T3 step 4 lack single descriptive commit messages; mapped via worker reports and build ids (`b105`, `b11`–`b17`) rather than one hash each.
- **T8 step 5 (a2)** mapped to `c8969af3` via `-S isPlayEdgeParkAdvanceEnabled` blame; step 5 worker report file was re-touched in later `phase 2` commits — product authority is `c8969af3`.
- **T1 Fallback-B** mapped to `9fe7aae8` (contains `T1-fallbackB-disable-multichart-migration-report.md`).
- **Order-entry prior T4 steps** (#18 reclassify, aggregates) assumed in tree before `baf2ab12` — not re-walked commit-by-commit.
- **Combined build id** not assigned — Manager cuts at unfreeze.
- **Working-tree exclusions** documented (H-S82 uncommitted, registry deltas, `drawing-tools-ui.js` M3 snippet) per conversation handoff.

---

## 7. Live-verification handoff

**N/A for this task.** PO uses the manifest §4 checklist **on the future combined build id** after §5 blockers clear. Confirm build id inside **every panel iframe** per L1.

---

## 8. Status

**DIAGNOSTIC-ONLY (manifest complete)** — living doc; update as re-migration phases land.

**Completeness note:** Manifest is a **living doc** — update as re-migration P1–P6 commits land, PO confirms b1/b2, and Lane 4 freezes Phase 0. Unclassified T1 interaction slices are flagged in manifest §1.2 rather than omitted.
