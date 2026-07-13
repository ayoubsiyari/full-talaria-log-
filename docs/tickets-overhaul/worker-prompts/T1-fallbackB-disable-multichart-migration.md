# WORKER PROMPT — T1 fallback (b): default the multichart migration OFF, ship a stable build

> Hand to the Lane 1 worker. **This invokes D-006's pre-authorized fallback (b).** No diagnostic, no test loop — this is a controlled rollback to restore known-good (pre-worker) multichart behavior while keeping single-chart gains. Bounded and reversible.

## WHY
T1 steps 4–8 destabilized multichart panel interaction (selection border, Ctrl+drag marquee, settings-menu-open) and iterative patching has not converged live. The PO confirms multichart worked acceptably **before** the T1 migration. D-006 ruling 3 pre-authorized: *"revert and default the multichart migration OFF (single-chart stays ON — it's live-confirmed), ship the PO a stable build, re-migrate once under the parity gate."* Do exactly that.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T1 fallback (b)**, Lane 1. RC-1.

## WHAT TO DO
Make the T1 **multichart-panel** migration default to OFF (pre-worker behavior) while **single-chart** stays ON:
- Flip the effective defaults so that, with no console flags set, **multichart panels use pre-T1 behavior**:
  - `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2` → effectively OFF (React ownership changes inactive in panels).
  - The panel-context paths of `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` and `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` → inactive **for iframe/panel embeds only**.
- **Single chart must keep the migration ON** (it is live-confirmed good). Gate the default by context (single-chart vs multichart-iframe-embed), not a global off switch.
- Prefer flipping a small number of default predicates over deleting code — the migration stays in the tree for the future re-attempt, just inactive in panels by default. Each still individually re-enableable via its existing `window.__TALARIA_*` flag for the later re-migration.

## MUST NOT
- Do NOT touch the pre-existing Ctrl+drag marquee bug (`PLAN2-FOUND#1`) here — it predates the migration; it's handled separately, out of this rollback.
- Do NOT weaken single-chart behavior.
- Do NOT delete the T1 store / migration code (we re-migrate later under the parity gate).

## BINDING CONSTRAINTS
- RC-1 only. I11: no mirror-frame work. L2: production trees only. I13.
- Both engine trees byte-identical + `MultichartGrid.jsx` consistent; SHA256 all touched files.
- Do NOT bump build id — Manager coordinates the single deploy bump.
- Harness gate stays green (I9). Note: some H-S3x panel scenarios assert migrated behavior — if any would go red under the panel-default-OFF, **list them** in the report; the Manager will move them to tracked-known-failing for the rollback window (do not silently change assertions).

## DELIVER (report `.md`: `worker-reports/T1-fallbackB-disable-multichart-migration-report.md`)
1. Exact default-flip diff (file:line), showing single-chart ON / multichart-panel OFF split.
2. State matrix: single chart (migration ON, unchanged) vs multichart panel (pre-worker behavior restored).
3. Which `window.__TALARIA_*` flags still re-enable each piece for the future re-migration.
4. Any harness scenarios affected (for Manager to reclassify) + gate result.
5. SHA256 all trees; `node --check` clean; build-id diff for Manager.
