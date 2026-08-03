# B-lane seal evidence audit — SEAL-EVIDENCE-01

**Standing rule.** Source evidence cannot bless served bytes. A seal row is `PASSED`
only when the sealed build itself produced runtime evidence. A check that can only
be performed statically must say so in its own verdict line rather than presenting
as a pass.

Produced by `scripts/seal-evidence-audit.mjs` (lane B), which classifies each gate
by what the file reaches for rather than by what it claims. Re-runnable:

```
node scripts/seal-evidence-audit.mjs
node scripts/seal-evidence-audit.mjs --json=docs/plan3/evidence/b-seal-evidence-audit.json
```

Disclosures landed by `scripts/seal-evidence-declare.mjs --write` so the token
travels into any sweep log; an audit document does not.

Template for a seal-grade row is E's item 12 / SERVER-WRITE-FAILURE-LEDGER-V1:
source oracle, served smoke, provenance match, observed behaviour rather than
configured intent, and a named refusal state for every way the instrument can
fail to run.

---

## 1. The count

| Evidence class | Gate files (canonical + mirror) |
|---|---|
| `SERVED_SMOKE` — HTTP against a live origin | **2** (`PASSPORT-3-LIVE`, `REBUILD-CONSTRAINT` surface mode) |
| `RUNTIME_BROWSER` — boots product in a browser | **1** (`SHELLPLAY-GUARD`, local harness) |
| `RUNTIME_TOOL` / `RUNTIME_MODULE` / `SANDBOX_SIM` / `STATIC_SOURCE` | **40** |

`REBUILD-CONSTRAINT` is the nuance that sharpens the rule: its ceiling class is
`SERVED_SMOKE` because it fetches the canary, but every `CARRIED` verdict it prints
is still decided by a regex against those bytes, and it says so —
`EVIDENCE CLASS: STATIC_BYTES`. Fetching the surface does not upgrade a substring
match into observed behaviour.

Cross-cutting hazards:

- **40 of 43** cannot observe a built product at all. After disclosure, **0** of those
  still present as an undeclared pass — that was the violation; it is closed for
  honesty, not for coverage.
- **9 rows assert configured intent** — they name a `__TALARIA_*` switch and exercise
  it in a sandbox. Green means the switch selects the coded branch against stubs,
  not that the sealed build's shipped default is the behaviour a user gets.
- **Panel-state text share is still high** (`TAL-01865-PANEL-BIND` 33/92 = 36% text
  asserts). The parse cells and `PARSE_CHECKER_ABSENT` refusal close the "would
  survive a syntax error" costume; they do not make the remaining text cells into
  runtime evidence.

---

## 2. Row by row

| Row | Evidence today | Seal verdict it may claim | What would make it a served PASS | Refusal states |
|---|---|---|---|---|
| BUILD-ID-01 | `RUNTIME_TOOL` | `RUNTIME_TOOL` (tooling) | N/A — refuses dirty/missing BUILD_ID before write | `BUILD_ID_ABSENT`; tool exit ≠ 0 |
| CLEAN-TREE-01 | `RUNTIME_TOOL` | `RUNTIME_TOOL` (tooling) | N/A — refuses dirty governed inputs | `DIRTY_BUILD_INPUTS`; exit 2 |
| REBUILD-CONSTRAINT | `STATIC_BYTES` (self-declared) against canary | `STATIC_BYTES` / `CARRIED` | runtime of each carried row still owed by its owner | `NOT_CARRIED`; self: `EVIDENCE CLASS: STATIC_BYTES` |
| PASSPORT-3-REPO | `RUNTIME_TOOL` (emitter sandbox) | `RUNTIME_TOOL` | never a served PASS by itself — that is why LIVE exists | emitter refusal paths; `ANCHOR_BROKEN` |
| PASSPORT-3-LIVE | `SERVED_SMOKE` | **`PASSED` only with sealed badge/digest/SHA match** | re-run `--mode=live` against sealed origin | `WRONG_DOOR`; `HTML_NOT_JSON`; `SERVED_SMOKE_NOT_RUN`; timeout |
| DEF-05a context recovery | `SANDBOX_SIM` | `SANDBOX_SIM` / `CONFIGURED_INTENT` risk | sealed smoke: inject contextlost, observe repaint ≤2s | `SANDBOX_SIM`; `SERVED_SMOKE_NOT_RUN` |
| DEF-05b / DEF-07 prefs bootstrap | `SANDBOX_SIM` | `SANDBOX_SIM` | sealed smoke: late/hung prefs, panels paint on defaults | `SANDBOX_SIM`; `SERVED_SMOKE_NOT_RUN` |
| LIFE-3 bfcache defeat | `SANDBOX_SIM` | `SANDBOX_SIM` | sealed smoke: Cache-Control / pagehide path observed on wire | `SANDBOX_SIM`; `SERVED_SMOKE_NOT_RUN` |
| HOSTCACHE-TEARDOWN | `SANDBOX_SIM` | `SANDBOX_SIM` | sealed smoke: 4→1 panel, host cache refs 4→0 | `SANDBOX_SIM`; `SERVED_SMOKE_NOT_RUN` |
| BARSTORE-1/2 | `SANDBOX_SIM` | `SANDBOX_SIM` | sealed soak: TF cap + refcount eviction under load | `SANDBOX_SIM`; `SEALED_METRIC_NOT_RUN` |
| P3-BAR-STORE-REALM | `SANDBOX_SIM` | `SANDBOX_SIM` | same as BARSTORE against sealed host | `SANDBOX_SIM`; `SERVED_SMOKE_NOT_RUN` |
| TAL-01865 pins / panel / viewport / drawimport | sandbox or module | `SANDBOX_SIM` / `RUNTIME_MODULE` | sealed refresh smoke: identity+config restore, no price restore | `SANDBOX_SIM`; `SERVED_SMOKE_NOT_RUN`; `PARSE_CHECKER_ABSENT` |
| RAYAN8 supporting surface | `SANDBOX_SIM` | `SANDBOX_SIM` | sealed UI smoke: mutual exclusion + gold supporting + Compare gate | `SANDBOX_SIM`; `SERVED_SMOKE_NOT_RUN` |
| SESSION-SYM restore / exclusivity | sandbox / tool | same | sealed restore + server reject of overlap | `SANDBOX_SIM` / `RUNTIME_TOOL`; `SERVED_SMOKE_NOT_RUN` |
| SERVER-WRITE-12 (item 12 template) | `SANDBOX_SIM` | **template, not sealed PASS** | sealed ticket carrying `failedServerWrites` after a real 5xx | `SANDBOX_SIM`; `SERVED_SMOKE_NOT_RUN`; `PASSPORT_FIELD_ABSENT` |
| CLAIM-FAILURE-13 | `SANDBOX_SIM` | `SANDBOX_SIM` | sealed smoke: 401/409 claim counted, gated fetch settles | `SANDBOX_SIM`; `SERVED_SMOKE_NOT_RUN` |
| SHELL-PLAY-RECEIVER / SHIPPED | `SANDBOX_SIM` | `SANDBOX_SIM` | composition defect — needs browser | `SANDBOX_SIM`; `SERVED_SMOKE_NOT_RUN` |
| SHELLPLAY-GUARD | `RUNTIME_BROWSER` local harness | **`SERVED_SMOKE_NOT_RUN` unless provenance = sealed** | same probe against sealed canary (or local dist proven = sealed SHA) | `PROBE_INERT`; `GUARD_*`; `PROVENANCE_MISMATCH` |

---

## 3. The sharpest instance in this lane

**SHELL-PLAY-01.** The sandbox gates (`shell-play-override-receiver`,
`shell-play-shipped-equivalence`) were green while the host instance stayed inert
on the canary — present, mirrored, and bound to nothing. That is FRAME-01's shape
in a different costume.

Today's runtime probe against local `dist-v9` stamped `20260803b126` /
`dirtyGoverned=0` eliminated start starvation and all four documented early exits.
That is real progress and still **not** a sealed served PASS until the same
observation is provenance-matched to the sealed identity. The probe now prints
`RUNTIME_BROWSER — local harness` so a sweep cannot misread it as canary credit.

**Second sharp instance — PASSPORT-3 itself.** The repo gate was green while the
live door returned login HTML under HTTP 200. That is why `passport3:live` exists,
and why SEAL-EVIDENCE-01 is not optional for this lane: B invented the disease
detector for this exact failure and still had 24 undeclared source greens this
morning.

---

## 4. What disclosure closed, and what it did not

Closed: undeclared source/sandbox greens presenting as ordinary PASS in a sweep
log. Every B gate in the lane roster now prints its evidence class at load.

Not closed:

1. **Coverage.** Honesty ≠ observation. Most seal rows still need a sealed smoke.
2. **Configured intent.** Nine rows can still green on a kill-switch name without
   observing the shipped default path. Those verdicts must carry
   `CONFIGURED_INTENT_UNOBSERVED` if presented at the seal without a smoke.
3. **Ceiling vs cell.** A file classified `SANDBOX_SIM` may still have a majority
   of cells that only match text. The audit prints the text-assert share for that
   reason; a high share is a smell, not a second green.

---

## 5. What I am asking for

1. **Presentation.** No B product row above is a sealed `PASSED` from source or
   sandbox alone. Tooling rows (BUILD-ID-01, CLEAN-TREE-01) may stay tool-green.
   REBUILD-CONSTRAINT may claim `STATIC_BYTES` / `CARRIED` only, which it already
   prints. PASSPORT-3-LIVE and SHELLPLAY-GUARD need provenance match to the sealed
   badge before they bless anything.
2. **Queue.** The two instruments that can convert the most-doubted rows are
   `passport3:live` (already pointed at the canary this morning) and the
   SHELL-PLAY browser probes with provenance. Those are the spend order after the
   door check, not another source gate.
