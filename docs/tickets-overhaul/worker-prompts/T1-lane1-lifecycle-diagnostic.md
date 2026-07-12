# WORKER PROMPT — T1 step 1 (Lane 1): Shared tool-lifecycle ownership DIAGNOSTIC

> Hand this whole file to the Lane 1 (senior) worker. **This is a read-only diagnostic — no code changes this step.** Implementation is gated behind a Director-approved design doc (step 2).

---

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T1 step 1**, Lane 1. This lane is the heaviest and long-lived (T1→T2→T5→T6); everything in the drawing/indicator clusters depends on it. This first task is **diagnostic only**.

## READ FIRST (binding)
- `docs/tickets-overhaul/README.md`
- `docs/tickets-overhaul/ROOT-CAUSES.md` — **RC-1** (your RC) and RC-2 (adjacent).
- `docs/tickets-overhaul/INVARIANTS.md` — binding; key ones below.
- `docs/tickets-overhaul/TRACKS.md` — **T1**.

## BINDING INVARIANTS
- **I1** — this discharges **RC-1** (shared tool lifecycle). If the mechanism you find belongs to another RC, STOP and report — do not fix "while you're there."
- **I4** — the symptom families "first-click fails", "ghost after delete", "selection/menu desync", "stale quick-menu" are shared-layer (RC-1/RC-2) defects. Fixing them inside an individual tool file is **forbidden**. This task exists to prove where the shared layer is.
- **P2 Timebox** — return within one session with either the verified ownership map or a documented dead end + next probe. This is a **diagnostic**: no edits, no kill-switch, no fix.
- **P4 Escalation** — your output feeds a Director-approval checkpoint (the T1 design doc). Deliver the ownership table; the Manager will escalate the design to the Director before any implementation.

## TASK (diagnostic — deliver an ownership table, no code changes)
Map today's selection/menu/label/lifecycle state ownership across the drawing-tools stack. Specifically answer, with **file:line evidence** for each:
1. **Who stores "the currently selected tool"?** Enumerate every independent owner: tool classes, Quick Menu, settings dialog, price/time label renderer, objects/layers tree, any hit-test cache. For each: what field, where set, where read.
2. **Who stores "hovered" and "editing" tool?** Same enumeration.
3. **The create → select → hover → edit → delete → hide lifecycle** for a representative tool (use a trendline and anchored VWAP as the two samples): trace which owner mutates at each transition, and identify where two owners can **disagree** (the desync that produces the symptoms).
4. **Delete path:** what removes the tool object vs what removes the observers/labels/dialogs pointing at it — pinpoint where a ghost label/dialog/observer survives a delete (RC-1 mechanism; TAL-00157 ghost family).
5. **First-click path:** trace what the first click mutates vs what the second click does that the first didn't — identify the missing transition/emit on first click (TAL-00322 family).

Deliver a table: `state` × `owner(s)` × `set site (file:line)` × `read site(s)` × `can-desync-with`, plus a short prose mechanism for the first-click and ghost-after-delete families.

Also propose (as prose, for the Director design checkpoint — NOT implemented): the shape of a single selection/lifecycle store + event set (`toolSelected`, `toolEdited`, `toolDeleted`, `toolHidden`) and the recommended **migration order** (per TRACKS: menus/labels first — highest ticket density — tool classes after).

## RC / FAMILY / ROWS
- **RC:** RC-1 | **Families:** first-click-fails (30), ghost-after-delete (19), selection-desync (43), stale-quick-menu (24) | **Registry rows:** cite representative refs from `TICKET-ANALYSIS.md` §3 (T0's PER-BUG-REGISTRY may not be published yet; use the doc refs).

## KILL-SWITCH
- N/A (diagnostic). The implementation task (T1 step 3) will use `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`.

## DELIVER (report back to the PO as a `.md`)
1. The ownership table (state × owners × file:line set/read × desync partners).
2. Mechanism prose for first-click-fails and ghost-after-delete, each tied to exact call sites.
3. Proposed store+events shape and migration order (design input only).
4. Explicit confirmation: **no files were edited** (diagnostic only).

## STOP CONDITIONS
If the shared layer already exists (contradicting RC-1), if the mechanism belongs to RC-2/RC-3 instead, or if the trace can't be completed in one session → STOP and report the finding + proposed next probe. Do not begin implementation — that waits for Director approval of the design doc.
