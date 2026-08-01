# DISPATCH A — Monster 2 may be cheap after all. I was too pessimistic; here is why, and the one test that decides it.

**2026-07-28 15:12. Revises my own "app-shell surgery, defer it" characterisation of the detached-document leak.**

---

## 1. Three facts I verified by direct read

| # | Fact | Evidence |
|---|---|---|
| 1 | **Multichart panels are real iframes** — each has its own `Document` and `Window` | `multichart-prod/multichart-manager.js:457` `document.createElement('iframe')` |
| 2 | **Panel teardown removes the iframe without navigating it away** | `multichart-manager.js:590` `try { c.frame.remove(); } catch (_) {}` then `this.charts.delete(id)`. No `about:blank`, no unmount. `about:blank` appears only at *creation* (`:463`) |
| 3 | **`createRoot()` is called and `.unmount()` is called NOWHERE in the tree** | `createRoot` at `talaria-design/src/main.jsx:7`, `talaria-design/live/main.jsx:13`, `admin-design/src/main.tsx:7`. **Zero occurrences of `.unmount(` or `unmountComponentAtNode` anywhere in `chart v 1.4/`** |

**A detached `HTMLDocument` paired with a detached `Window` is, in practice, an iframe.** The host page's own document is not detached — it is the live page. **So the leaked documents in the PO's heap snapshot are almost certainly removed iframes**, and fact 2 says we remove iframes in exactly the way that leaks them.

## 2. Why this is a candidate for cheap rather than surgical

**The teardown function is already the right shape.** It deliberately destroys the Q7 command bridge, then the Q5 sync bridge, then disposes the panel's indicator generation — **each guarded, each behind a named kill-switch, each commented "before the iframe drops."** Somebody has already walked this path three times for three different retainers.

**The leak is a fourth retainer in a list that already has three entries.** Adding `frame.src = 'about:blank'` before `frame.remove()` — or a panel-side unmount hook called in the same block — is the shape of change this function already accepts. **`about:blank` is the blunt instrument that matters: it forces the browser to discard the old document wholesale, which drops every retainer inside it without our having to enumerate them.** That is the same inversion as C's freeze and C's transport oracle: **stop enumerating retainers, make the observable impossible.**

**This is not app-shell surgery. I said it was, and that was a guess I did not check.** Third time today I have published a characterisation ahead of the evidence, after the rAF magnitude and the I-7 path.

## 3. What I do NOT know, labelled per BRIEF-02

**Hypothesis, not fact:** that the detached documents in the PO's snapshot *are* panel iframes.

**The gap is real.** My retainer finding says the leaked content is the **Next.js app shell**, retained by `FiberRoot.containerInfo`. But `homepage/` is Next.js while the `createRoot` sites above are Vite/React in `talaria-design`, and panels load a static chart shell served by nginx — **which is not obviously the Next app.** So either the leaked documents are a different iframe population than multichart panels, or my "Next.js app shell" attribution was imprecise. **One of those two statements is wrong and I cannot tell which from reading alone.**

**Also unresolved:** the leak was present *at idle* with 19,807 detached divs. That is consistent with panels opened and closed earlier in the session, but it does not prove it.

## 4. The one test that decides it — and it is cheap

**Assigned to A, ahead of M25.** M25's ceiling is a few CPU points; this decides whether a 1.6 GB defect is a three-line fix or a deferred disclosure. **The expected-value ordering is not close.**

**Protocol.** Open one chart. In DevTools Memory, take a snapshot and record the count of detached `HTMLDocument` objects — **`HTMLDocument`, not `<div>`; per Ruling M-5 the document count is the headline metric.** Open a multichart layout, close it, and repeat five times, returning to the same single-chart state. Snapshot again and record the same count.

**Decision rule:**

- **Climbs by roughly one document per panel per cycle** → mechanism confirmed, monster 2 is a small fix in the `:590` block, and it is back in the 48-hour window.
- **Flat** → panels are not the population, my §1 chain is wrong, the leak is elsewhere, and the deferral stands. **Report that outcome as loudly as the positive one.**

**If confirmed, the fix carries two hazards to design against, not around.** `frame.src = 'about:blank'` is an asynchronous navigation, so ordering against `remove()` needs to be deliberate rather than hopeful; and anything touching `contentWindow` after teardown will find a different document than it expects. **Kill-switch required, same pattern as the three teardown steps already there.**

**Acceptance is M-1: a long session, not a fresh tab, and the metric is the detached document count with a target of zero.** C-2's paired-measurement requirement does not apply — this is an object count, not a CPU percentage, so it does not have the 4.5-point noise floor that forced C-2.

## 5. Standing note

**`.unmount()` appearing zero times in a codebase that calls `createRoot()` is a defect independent of whether it explains this leak.** Even if §4 comes back flat, that finding stands on its own and belongs in the backlog with a named owner.
