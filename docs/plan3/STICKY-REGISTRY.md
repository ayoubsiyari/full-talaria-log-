# Plan 3 sticky-bug registry

**Authority:** `docs/plan3/README.md` — Closure durability & sticky bugs  
**Opened:** 2026-07-22  
**Batch rule:** repeated messages in one export wave count once; recurrence means the symptom returns in a later batch after `FIX-LANDED` or `CLOSED-VERIFIED`.

## States

- `RECURRENCE-A-PENDING`: a prior fix/closure and a later symptom report exist, but the reporter's URL/build/service-worker identity is missing. This is a sticky suspect, not yet a confirmed `STICKY` row.
- `A-STALE`: the report came from an old or mixed surface. Recover device cache/SW hygiene and re-verify; do not reopen the engine mechanism.
- `B-NEW-MECHANISM`: same visible symptom, different mechanism. Open a cross-linked row; the old closure stands.
- `STICKY`: provenance is current and the exact prior symptom still reproduces. Reopen the original diagnostic, treat its root cause as unproven, and apply the elevated kill bar.
- `DURABILITY-REVERIFY`: the only negative report predates the later fix/verification, so it is not post-closure recurrence; reporter-device verification is still required under the new closure rule.

No row may move from `RECURRENCE-A-PENDING` to `STICKY` without non-null reporter-device URL, shell, engine, embed/SW, host, and tested-panel build identity.

## 2026-07-21 intake reconciliation

The repository contains **nine unique reopen-signal tickets**, not ten:

`TAL-01617`, `TAL-01718`, `TAL-01717`, `TAL-01723`, `TAL-01584`, `TAL-01585`, `TAL-01719`, `TAL-01707`, `TAL-01690`.

Six have literal `not sloved` follow-ups; TAL-01719, TAL-01707, and TAL-01690 use equivalent unresolved wording. The PO's tenth ticket is not present in the listed IDs or tracked exports and remains a PO reconciliation question.

## Active recurrence triage

| Ticket / row | Prior accepted or landed state | Later recurrence evidence | Step (a): stale-surface evidence | Provisional next branch | Current state |
|---|---|---|---|---|---|
| TAL-01617 → M6 | Plan 2 `CLOSED-VERIFIED`, PO b01 PASS 2026-07-18; CB-16 fix chain ended at `8780ba3f` | Message 3073, 2026-07-19 23:33: `not sloved` | **Missing reporter URL/build. Strong stale prior:** CB-16 was only on direct b105 while public remained pre-fix b100 | If current uniform surface reproduces: (c), reopen order-drag label diagnostic | `RECURRENCE-A-PENDING` |
| TAL-01718 → M2 | A3/TAL-01582 tick-mode family closed, but the exact `>30x` condition had no permanent RED | Message 3068, 2026-07-19 23:17: `not sloved` | Missing reporter URL/build | Likely (b): speed-threshold fast-mode mechanism is a different cell; prove only after (a) | `RECURRENCE-A-PENDING` |
| TAL-01717 → M2 | CB-23 `FIX-LANDED` at `34a7139f` / source b107 | Message 3069, 2026-07-19 23:18: `not sloved` | **Missing reporter URL/build. Strong stale prior:** CB-23 had no uniform checkpoint/public parity | If current uniform surface reproduces: (c), CB-23 mechanism becomes unproven | `RECURRENCE-A-PENDING` |
| TAL-01723 → M4 | CB-20 `FIX-LANDED` at `8cb4f6f0` / source b103 | Message 3067, 2026-07-19 23:12: `not sloved` | **Missing reporter URL/build. Strong stale prior:** CB-20 had no rollback discriminator or uniform checkpoint | If current uniform surface reproduces: (c), reopen pip-aligned Y-tick diagnostic | `RECURRENCE-A-PENDING` |
| TAL-01584 → M3 candidate | Plan 2 PO b07 PASS 2026-07-18 | Message 2907 `not sloved` was sent 2026-07-14, **before** the later PASS | Chronology disproves post-closure recurrence; current reporter-device proof is still absent | Fresh exact-scenario reporter retest; do not call this sticky from message 2907 | `DURABILITY-REVERIFY` |
| TAL-01585 → M19 | T5/RC-3 `CLOSED-VERIFIED`, PO PASS 2026-07-17 | Message 3086, 2026-07-20 09:43: `not sloved` | Missing reporter URL/build/SW | If current uniform surface reproduces: (c); missed cell is likely spinner-visible TF switch + drag, but must be proven | `RECURRENCE-A-PENDING` |
| TAL-01719 → M8 | CB-22 `FIX-LANDED` at `34a7139f` / source b107 | Message 3066, 2026-07-19 20:16: still partially occurring | **Missing reporter URL/build. Strong stale prior:** follow-up was 19 minutes after commit and no uniform checkpoint existed | If current uniform surface reproduces: (c), reopen TF viewport-preservation diagnostic | `RECURRENCE-A-PENDING` |
| TAL-01707 → M8 | Related T8/date-jump family was closed; this ticket had no ticket-specific RED | Message 3033, 2026-07-19 08:56: still jumps to distant dates | Missing reporter URL/build; trigger sequence is also missing | After (a), obtain exact action and decide (b) vs (c); no speculative M8-wide fix | `RECURRENCE-A-PENDING` + `NEEDS-PO-CLARIFY` |
| TAL-01690 → M8 | Related T8/date-jump family was closed; this ticket had no ticket-specific RED | Message 3015, 2026-07-18 09:19: still occurring | Missing reporter URL/build; report may predate the later b07 verification and lacks a trigger | After (a), obtain exact action/chronology and decide (b) vs (c) | `RECURRENCE-A-PENDING` + `NEEDS-PO-CLARIFY` |

## Sticky watch required in every checkpoint report

- **Confirmed `STICKY`: none yet — every candidate is still blocked at triage step (a).**
- **First suspects:** M19 / TAL-01585 and M8 / date-jump family.
- **Likely deployment ghosts requiring proof:** TAL-01617, TAL-01717, TAL-01723, TAL-01719.
- **Not a post-closure recurrence on present evidence:** TAL-01584.
- **Third-recurrence Director escalations:** none. M8's multiple filings in the 2026-07-21 wave count as one recurrence batch.

## Required reporter-device capture

For the exact failing device and URL, record:

1. ticket, device/OS/browser or installed-app version;
2. exact user action and whether replay/sync/multichart are on;
3. URL;
4. shell, engine, embed/SW, host, and every tested panel build id;
5. whether the exact symptom survives a hard reload and service-worker update;
6. screenshot/video with the build identity in the same evidence bundle.

If historical identity cannot be recovered, repeat the exact scenario on the next uniform checkpoint. A mixed or old identity is `A-STALE`, not evidence that the engine fix failed.

## Death counters

The two-zero-batch counter starts only after a confirmed `STICKY` row receives a new fix and reporter confirmation. No active row has started that counter.
