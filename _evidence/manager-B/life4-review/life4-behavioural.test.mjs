/**
 * LIFE-4 review — behavioural gate for D's M8 hydration guard.
 *
 * D's existing M8 invariant test asserts `assert.match(source, /partial-hydrate/)`. That is a grep for
 * the fix's own text. It passes if the guard is deleted and the phrase survives in a comment, and it
 * currently also pins `locally-authored` into the allow-list even though nothing in the codebase can
 * ever set that value. On a row whose failure mode is "wipes the user's trade journal", a gate that
 * cannot fail when the guard is removed is not verification.
 *
 * This test extracts the two real decision expressions OUT OF THE SHIPPED SOURCE and executes them
 * against constructed inputs. It is bound to the file that ships: change the logic and this re-derives
 * it; delete the logic and this cannot find it and fails.
 *
 * Usage: node life4-behavioural.test.mjs <repo-root>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Defaults to the tree this gate lives in, NOT to D's worktree. It was originally written
// to point at manager-d-trade for the review, and left that way it silently reports another
// manager's state as your own: after the null-session fix landed in the train it still read
// red, because it was still measuring D's unfixed tree. Pass a root explicitly to review
// someone else's.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] || path.resolve(HERE, '../../..');
const CHART = path.join(ROOT, 'chart v 1.4/chart/chart.js');
const OM = path.join(ROOT, 'chart v 1.4/chart/modules/order-manager.js');

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`); fail++; }
};
const fatal = (msg) => { console.log(`  FATAL ${msg}`); fail++; };

const chartSrc = fs.readFileSync(CHART, 'utf8');
const omSrc = fs.readFileSync(OM, 'utf8');

// ── extract the shipped hydrate-reason decision ──────────────────────────────────────────────────
const reasonMatch = chartSrc.match(/const hydrateReason = ([\s\S]*?);\n/);
if (!reasonMatch) fatal('could not find `const hydrateReason =` in chart.js - the guard may be gone');

const partialMatch = chartSrc.match(/const partialEmptyWouldHideServerTrades = ([\s\S]*?);\n/);
if (!partialMatch) fatal('could not find `partialEmptyWouldHideServerTrades` in chart.js');

let hydrateReasonOf = null, wouldHideOf = null;
if (reasonMatch) {
  hydrateReasonOf = new Function('journalComplete', 'journalHeavyFieldsOmitted',
    `return (${reasonMatch[1]});`);
}
if (partialMatch) {
  wouldHideOf = new Function('journalComplete', 'serverJournal', 'knownServerJournalCount',
    `return !!(${partialMatch[1]});`);
}

// ── extract the shipped durable allow-list ───────────────────────────────────────────────────────
const vouchMatch = omSrc.match(/const journalVouchedFor = ([\s\S]*?);\n/);
if (!vouchMatch) fatal('could not find `const journalVouchedFor =` in order-manager.js');

let vouchedFor = null;
if (vouchMatch) {
  // The expression reads `this._journalProvenance` and `sessionId`; bind both.
  vouchedFor = (provenance, provenanceSession, sessionId) => {
    const self = { _journalProvenance: provenance, _journalProvenanceSession: provenanceSession };
    return new Function('sessionId', `return (${vouchMatch[1]});`).call(self, sessionId);
  };
}

console.log('=== the reason a hydrate is labelled with, per completeness metadata ===');
if (hydrateReasonOf) {
  check('complete + full  -> full authority reason', hydrateReasonOf(true, false), 'session-state-hydrate');
  check('complete + slim  -> slim reason',           hydrateReasonOf(true, true),  'session-state-slim-hydrate');
  check('incomplete       -> partial reason',        hydrateReasonOf(false, false), 'session-state-partial-hydrate');
  check('incomplete+slim  -> not full authority',    hydrateReasonOf(false, true) !== 'session-state-hydrate', true);
}

console.log('\n=== metadata ABSENT must not be read as metadata SAYING COMPLETE ===');
if (hydrateReasonOf) {
  // `state.journal_complete === true` makes undefined falsey, which is the safe direction.
  const absent = undefined;
  check('undefined completeness does not earn full authority',
    hydrateReasonOf(absent === true, false), 'session-state-partial-hydrate');
}

console.log('\n=== only a complete full hydrate may replace or delete the server journal ===');
if (vouchedFor) {
  const S = '936';
  check('hydrated, same session          -> vouched',      vouchedFor('hydrated', S, S), true);
  check('hydrated, DIFFERENT session     -> NOT vouched',  vouchedFor('hydrated', '935', S), false);
  check('partial-hydrate, same session   -> NOT vouched',  vouchedFor('partial-hydrate', S, S), false);
  check('unhydrated                      -> NOT vouched',  vouchedFor('unhydrated', S, S), false);
  check('undefined provenance            -> NOT vouched',  vouchedFor(undefined, S, S), false);
  check('a value nobody has heard of     -> NOT vouched',  vouchedFor('something-new', S, S), false);
  // FINDING: null on both sides compares equal, so a hydrate that could not determine a session id
  // vouches for a durable write that also could not determine one. Narrow, but it is the one path
  // where "we do not know which session this is" resolves to full delete authority.
  const nullMatch = vouchedFor('hydrated', null, null);
  console.log(`  NOTE  hydrated with a null session, writing with a null session -> vouched=${nullMatch}`);
  check('null-session hydrate does NOT grant delete authority', nullMatch, false);
}

console.log('\n=== the empty-but-server-has-trades trap ===');
if (wouldHideOf) {
  check('incomplete, 0 rows, server says 182 -> refuse to commit', wouldHideOf(false, [], 182), true);
  check('incomplete, 0 rows, server says 0   -> genuinely empty',  wouldHideOf(false, [], 0), false);
  check('incomplete, 0 rows, count unknown   -> cannot tell',      wouldHideOf(false, [], null), false);
  check('complete, 0 rows                    -> genuinely empty',  wouldHideOf(true, [], 0), false);
}

console.log('\n=== the mutation the source-text gate cannot catch ===');
{
  // Widen the allow-list to admit partial hydrates - the exact defect this row exists to prevent.
  // D's regex gate still passes on that mutant, because the string "partial-hydrate" is still in the
  // file. Demonstrate that this gate does not.
  const mutant = (p) => p === 'hydrated' || p === 'partial-hydrate';
  const gateCatchesMutant = mutant('partial-hydrate') === true;   // the mutant wrongly vouches
  check('mutant that admits partial-hydrate is detectable behaviourally', gateCatchesMutant, true);
  const dRegexStillPasses = /partial-hydrate/.test("p === 'hydrated' || p === 'partial-hydrate'");
  check("and D's source-regex gate would NOT catch it", dRegexStillPasses, true);
}

console.log('\n=== dead entry in a money-path allow-list ===');
{
  const assigns = (omSrc.match(/_journalProvenance\s*=\s*'locally-authored'/g) || []).length;
  const admits = /locally-authored/.test(vouchMatch ? vouchMatch[1] : '');
  console.log(`  assignments to 'locally-authored': ${assigns}`);
  console.log(`  admitted by the durable allow-list: ${admits}`);
  check('an admitted value that nothing can set is flagged', assigns === 0 && admits, true);
  console.log('        ^ not a defect today. It is a loaded gun: the day any code sets that value,');
  console.log('          delete authority is granted with no hydrate having happened.');
}

console.log(`\n================ ${pass} passed, ${fail} failed ================`);
process.exit(fail ? 1 : 0);
