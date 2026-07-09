# PHASE 4 — Integration, live-runtime proofs, ship report

Goal: prove the strategy surface works against a REAL backend, run a double regression, and produce
the ship report. Workers A and B are offline — their verification sections are redistributed below.

## A. Environment boot (lean live stack — no 15-20 min chart build)
The `trading-chart` compile is irrelevant to strategy verification. Bring up only what the strategy
surface needs, and run the frontend in dev so Next rewrites proxy the journal API.

Prereq: **start Docker Desktop** (daemon currently down).

```
# from repo root
docker compose up -d db redis journal-backend
docker compose ps           # wait until journal-backend is healthy (start_period ~60s)

# frontend (separate terminal) — real backend via rewrites (:5000)
cd homepage
npm install                 # first run only
npm run dev                 # http://localhost:3000
```

- App: http://localhost:3000/dashboard/?view=stratbank
- Journal API health: http://localhost:5000/api/health
- Create a test account via the app's signup/login (live mode requires an authed user + JWT).
- If `next dev` can't reach the API, set `JOURNAL_BACKEND=http://127.0.0.1:5000` before `npm run dev`.

NOTE: browser CLICK-CRAWLS are human/browser tasks. Workers without browser control verify what they
can from backend state (Postgres rows, API responses, forced 401/500) and hand the pure-UI click
checks to the director. Any bug found becomes a NEW fix task with normal zone ownership / ICR.

## B. Redistributed verification ownership (A & B offline)
Verification is read/exercise (no edits expected), so reassignments carry no write-zone conflict.
| Bundle | Original owner | Reassigned to | Report |
|---|---|---|---|
| Persistence & lifecycle | A | **Worker D** | reports/D/PHASE4_PERSISTENCE.md |
| Builder modal | B | **Worker C** | reports/C/PHASE4_BUILDER.md |
| Canvas | C | Worker C | reports/C/PHASE4_VERIFY.md |
| Bank page | D | Worker D | reports/D/PHASE4_VERIFY.md |

(If fresh A/B workers come online, hand the persistence/builder bundles back to them.)

## C. Runtime checklist (the deferred proofs)
### Persistence & lifecycle (A1/A2/A6 + round-trip)
- A1: load bank, kill `/strategies` (stop container or force 500) then refresh → strategies MUST NOT
  vanish; stale/error surfaced; last-known bank kept. 200 `{strategies:[]}` → authoritative empty.
- A2: delete a strategy with backend forced to 500 → row STAYS, in-app error (no window.alert);
  success → row removed after API returns.
- A6: force `/strategies` 500 while `/journal/list` succeeds → entries/journal still render, only
  bank marked stale (verify the isolation fix).
- Round-trip: save → reload → diff every field (name, desc, markets, instruments, support,
  timeframes incl. custom, tags, images, emoji, canvasNodes/edges, variables, tree, conditions).
- A7: save "My Strat!" then "My Strat" → duplicate blocked consistently.
- A4: oversized-image strategy → save blocked pre-network with clear message.

### Builder modal (B1–B5)
- B1: close with unsaved changes → confirm; pristine close → no prompt.
- B2: >6 timeframes / lowercase `1h` template → normalized+capped at save.
- B3: 10 traded + 10 support symbols all visible; 11th → "Max 10".
- B4: edit existing strategy → every step-1 field restores incl. custom TFs and saved markets.
- B5: blocked Next shows missing field names; mobile at 4 images → no Add tile; overlong tag capped.

### Canvas (C1–C4)
- C1/C2: undo/redo stress (20+ mixed ops: add/delete/rename/move/connect/template load) round-trips;
  undo after template load returns to prior build.
- C3: delete last group → info-styled notice; outline status menu outside-click closes; board image
  validation parity; empty outline label restores default.
- C4: print with no name → clear message, no popup flash; happy path prints with logo.
- Double-confirm: apply template while editing → exactly ONE confirm.

### Bank page (D1/D3/D4)
- D1: only My Strategies surface renders (community gated); no dead "Use Strategy" controls.
- D3: sort menu shows only Name / Net P&L; bank sort dropdown independent from Sessions; badge =
  real rows in demo mode.
- D4: template-preview action reads "Hide"; real delete says "Delete" + confirm.

## D. Double regression + ship report
- Run the full manager regression checklist twice (once mid-Phase-4, once final).
- Manager compiles `reports/MANAGER/SHIP_REPORT.md` for director sign-off: per-phase results,
  outstanding runtime items, known risks, go/no-go.
