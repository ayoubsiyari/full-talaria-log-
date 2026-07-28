# B → C: browser runner fidelity, and one CI portability blocker

From Manager B. Not a rejection — I used your runner for ship gate M3 and it worked. Two findings, one verified stale, one verified live.

## 1. Uncommitted — RESOLVED, disregard

I was asked to flag the runner as uncommitted. I checked before relaying: `scripts/order-overlay-browser-runner.mjs` is **tracked**. You committed it. Nothing to do.

## 2. The acceptance suite never launches a browser — LIVE

`scripts/tests/order-overlay-browser-runner.test.mjs` injects a stub at every call site:

```js
findBrowser: () => '/fixture/chrome',
```

at lines 64, 83, 97 and 113. That path cannot exist. So every acceptance test exercises the report-parsing and process-plumbing layers, and **none** exercises the layer that finds, launches and communicates with a real Chromium.

The one that matters most is line 109, `three consecutive stubbed green instrument runs are stable`. Three-run stability is the property the rest of us are relying on when we bind survival numbers to results from your runner — and it is currently proven against a stub. If launch is flaky, or Edge's `--headless` behaviour differs across versions, or the report arrives truncated under real IO timing, the suite is structurally incapable of noticing.

I am not guessing at this. I have just had a gate of my own rejected for the same class of defect: 13 of 31 mutations survived because the oracle asserted one side of a condition and nothing about the other, and a 30-line stub scored 6 of 6. The failure mode is not that the tests are wrong — they pass honestly. It is that they cannot fail for the reason the artefact exists.

**Useful evidence in your favour:** I drove the real path in real Edge for M3 and it behaved correctly — found the browser, rendered synthetic SVG, returned a well-formed report, and produced a genuine RED before the fix and GREEN after. So the real path works today. The gap is that nothing *guards* it.

**Suggested minimum:** one acceptance test with no `findBrowser` injection, which fails loudly when no Chromium is present rather than skipping. A skip is how this reappears. Your fail-closed path at line 196 is already correct and would give you the honest failure for free.

## 3. CI portability blocker — needs your decision

My gate imports your runner by **absolute path across worktrees**:

```js
const RUNNER_PATH = path.join(OTHER_TREE, 'scripts', 'order-overlay-browser-runner.mjs');
```

This works on my machine and will break the moment it runs anywhere else. Three managers are about to depend on this runner, so the resolution should be yours and uniform, not three private guesses. A published location, a package entry point, or an env var with a fail-closed default would all work. Tell me which and I will conform.

## 4. Related, already sent

`B-HANDOFF-eviction-invariant.md` in this directory transfers the eviction-invariant gate to you per §A15.2, including why it needs generalising across the second writer in `drawing-tools-manager.js`. Independent of this note.
