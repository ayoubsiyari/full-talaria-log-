# Kill-switch inventory — D-5 single push

**Owner:** Manager B (release) · 2026-07-28
**Standard:** every change that can hurt a user at runtime must disable behind an explicit vocabulary; anything unrecognised leaves the protection ON. A switch that has never been shown to disable its feature is not a switch.

---

## 1. Inventory

| # | Feature | Switch | Default | How to throw | Takes effect | Disable proven by |
|---|---|---|---|---|---|---|
| 1 | Client hydration guard (B-2 / B-W16) | `window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1` | unset → **guard ON** | Browser console: `window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1 = true` | Next durable write; **no redeploy** | NC-1, NC-2, NC-3* in `b-w16-hydration-guard.test.mjs`; B-W18 mutants 6/0 |
| 2 | Backend parse guard (I-7 / B-W17) | env `JOURNAL_SWEEP_PARSE_GUARD_ENABLED` | unset → **guard ON** | Set `false` (or `0`/`no`/`off`), restart `trading-chart` | On restart | NC-4, NC-5, NC-6* in `test_b_w17_journal_sweep_guard.py`; B-W18 mutants 6/0 |
| 3 | Deletion logging | *(none, deliberate)* | always on | — | — | N/A — logging is not a behaviour to disable under incident pressure |
| 4 | A — orphan replay teardown | **none known** | — | — | redeploy only | not yet inventoried |
| 5 | A — render-path lag fix | **REQUIRED; BLOCKS TRAIN** | must default ON | A owns the flag name | must be next-frame / no redeploy | A must ship NC cells that reproduce the pre-fix lag with the switch thrown |

**Disable vocabulary (fail-closed):**

| Switch | Values that DISABLE | Everything else |
|---|---|---|
| `__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1` | `true`, `1`, `'1'`, `'true'`, `'yes'`, `'on'` (trim, case-insensitive) | guard stays ON — including `'false'`, `''`, `0`, `null`, garbage, absent `window` |
| `JOURNAL_SWEEP_PARSE_GUARD_ENABLED` | `0`, `false`, `no`, `off` (trim, case-insensitive) | guard stays ON — including `""`, `"disabled"`, `"fasle"` |

If you throw a switch and behaviour does not change, check the spelling before concluding the switch is broken.

---

## 2. Rehearsal — prove disable, not just that the flag is read

Run from a clean tree on `manager-b/plan3-20260727`:

```
# Client + backend kill-switch acceptance + mutants + VER-04
node chart\ v\ 1.4/chart/modules/b-w18-killswitch.mutants.mjs
```

**Last rehearsal (2026-07-28 17:17):** 6 designed / 0 survived; VER-04 no-op stub dies; independent reimplementation passes; both product files restored byte-exact.

**What "disable proven" means here:** with the switch thrown, the original defect reproduces (alias-wipe / empty-journal durable write). A cell that only asserts "the flag was read" is not a disable proof.

---

## 3. Live surface — neither switch is deployed yet

Probe against `31.97.192.82:3000` at 16:17Z (evidence
`probe-2026-07-28T16-17-18-802Z-31.97.192.82_3000.json`):

| Marker in served `order-manager.js` | State |
|---|---|
| `journalVouchedFor` | ABSENT |
| `_bW16HydrationGuardEnabled` | ABSENT |
| `__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1` | ABSENT |

So today there is nothing to throw on the running system. Post-push, the probe must report all three PRESENT before Tier-1 rollback is available on that surface.

---

## 4. Gap that blocks the train

Item 5 has no switch. Director ruling 16:52: **A adds the switch and it blocks the train.** This inventory cannot close item 5; assembly waits on A. Once A lands it, add the flag name, disable vocabulary, and the NC cell path to this table in the same commit that merges A's change.
