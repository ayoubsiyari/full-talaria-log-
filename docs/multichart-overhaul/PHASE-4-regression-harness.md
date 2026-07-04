# Phase 4 — Automated Regression Harness (end the whack-a-mole permanently)

**Root cause fixed:** RC5. After this phase, no multichart change merges unless the
harness is green — "closing one bug opens another" gets caught by a machine in minutes,
before testers ever see the build.

**Approach is already proven:** the same pattern (headless Chrome via puppeteer + a stub
bar API server) validated the reference prototype with 17 automated assertions on
2026-07-04. This phase points that pattern at the REAL engine and bridges instead.

**Gate (project exit):** harness green on all scenarios below × (sync ON/OFF) ×
(same-pair / independent-pair); testers resume using the Phase-0 matrix as their script.

---

## Task 4.1 — Stub bar server + harness skeleton

**Files (new):** `chart v 1.4/chart/multichart-prod/harness/` — `package.json`
(private, devDependency `puppeteer` only — official npm package), `serve.mjs`, `run.mjs`.
`node_modules` is already git-ignored; nothing here ships in Docker (verify `.dockerignore`
`**/node_modules` covers it; the harness folder itself is fine to commit).

`serve.mjs` (Node, no deps):
- Serves the REAL files statically: `/chart/multichart-prod/*` (bridges, embed html),
  `/chart/chart.js`, `/chart/modules/*`, `/chart/dist-v9/*` from the canonical
  `chart v 1.4/chart/` tree — so the harness always tests the exact code being edited.
- Emulates the API endpoints the engine calls with deterministic synthetic 1m candles
  (~90 days), matching real response shapes: `/api/file/{id}/bars` (with `has_more_left/right`,
  `resolution`, anchor-start truncation at `limit`), `/api/file/{id}/smart`,
  `/api/file/{id}/meta`. Two file ids (e.g. 25 and 27) for independent-pair scenarios.
- Logs every API hit with query params → the harness asserts on FETCH COUNTS, the core
  ownership invariant.

`run.mjs` (puppeteer):
- Boots the real multichart page (whatever URL the production grid uses — if the full
  dist-v9 React page is too heavy to boot headless, fall back to composing
  `chart-embed.html` panels + a minimal host page that loads `chart.js` + the manager,
  mirroring `MultichartGrid`'s wiring; document whichever is chosen).
- Uses `window.__mcDiagReport()` (Phase 0) inside the page for assertions.
- Simulates gestures with real mouse events (`page.mouse.down/move/up`) — NOT direct
  function calls — so the drag/burst code paths are exercised.

**Acceptance criteria:** `npm test` boots a 2×2 same-pair layout, waits for 4 painted
panels, prints a diag table, exits 0. Zero console errors during boot.

---

## Task 4.2 — Scenario assertions

Implement as individually-named tests; each resets diagnostics first. Minimum set
(mirrors the Phase-0 matrix — keep IDs in sync):

| Test | Simulates | Asserts |
|------|-----------|---------|
| H-S2 | drag tile A right 3 screens, sync ON | only HOST row fetches; all panels' first/last bar equal; seams = 0 |
| H-S3 | drag panel B right, sync ON and OFF | host is only fetcher (same-pair); B's bar count grows DURING drag (sample mid-gesture); no mouse-up jump (offset delta < 2px at release) |
| H-S5 | independent panel B, drag right | B fetches for itself; host fetch count unchanged; seams = 0 |
| H-S6 | TF fan-out 1m→1h→1m | ≤1 fetch per TF per OWNER, 0 per panel; panels land on identical bars |
| H-S7 | panel-B-only TF with interval sync OFF + replay frames | B's TF unchanged after 100 replay frames |
| H-S8 | replay play 15 s (accelerated) | fetches during play ≈ forward prefetch only; renders bounded; playhead equal across panels every second |
| H-S10 | cold boot 2×2 | same-pair panels: 0 fetches; time-to-painted under budget (set from Phase-3 baseline +20%) |
| H-S11 | close layout → single chart drag | single chart diag matches recorded single-chart profile (catch leftover multichart state) |
| H-INV | after every test | seam counter = 0 on every panel; no console errors; `_serverCursors` edges == array edges |

**Acceptance criteria:** all tests pass 5 consecutive runs (flake check). A deliberately
introduced bug (e.g. re-enable a panel fetch path via kill-switch) makes H-S2/H-S3 fail —
prove the harness actually catches the class of bug it exists for.

---

## Task 4.3 — Wire into the workflow

- Add `docs/multichart-overhaul/CHECKLIST.md`: the manager's merge checklist — worker
  report complete (see README §4) + harness green locally + hashes match.
- Add the harness to CI if available (`.github/workflows/`): run on PRs touching
  `chart v 1.4/chart/**` or `talaria-design/src/Multichart*`. Keep the existing
  security workflow untouched.
- Update `docs/multichart-panel-data-and-rendering.md` with a short "Phase 1–4 landed"
  section and links here (that doc is the long-term reference; this folder is the
  execution plan).

**Acceptance criteria:** one full dry run: take any small change, run the checklist end
to end, merge. Then testers resume.

---

## After the plan (backlog, do NOT start without a new decision)

- Off-thread resampling in a shared Web Worker (old doc's Phase 3) — only if profiling
  still shows resample jank after Phase 3.
- Single-process multichart (collapse iframes) — the endgame architecture; a large
  project to be planned separately if the above is still not enough.
