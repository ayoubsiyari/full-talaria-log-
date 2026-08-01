/**
 * The oracle decides whether a fix ships, so it gets tested against the cases it exists to catch —
 * above all the one the no-regression clause was added for: a fix that helps the trade-heavy arm and
 * quietly hurts zero-trade. If that case does not fail here, the clause is decorative.
 *
 * The second batch tests the subtler thing: that FAILING TO DETECT a regression is not treated as
 * evidence of no regression. That distinction is the whole difficulty of the clause.
 */
import { verdict, detectableDelta } from './regime-oracle.mjs';

let pass = 0, fail = 0;
const check = (name, got, want) => {
  if (got === want) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  (got ${got}, wanted ${want})`); fail++; }
};
// Deliberately tight samples: the point is that the oracle must NOT be fooled into claiming precision
// the instrument does not have just because a handful of numbers happened to agree.
const around = (v, n = 5) => Array.from({ length: n }, (_, i) => v + (i % 2 ? 1.5 : -1.5));

console.log('=== the case the clause exists for ===');
const sneaky = verdict({
  tradeBearing: { before: around(600), after: around(400) },   // big win
  zeroTrade:    { before: around(300), after: around(360) },   // quiet 20% loss
}, { declaredRegime: 'tradeBearing' });
check('helps trade-heavy, hurts zero-trade => FAIL', sneaky.pass, false);
check('  and names it a regression', /REGRESSION/.test(sneaky.reason), true);

console.log('\n=== a clean fix ===');
const clean = verdict({
  tradeBearing: { before: around(600), after: around(400) },
  zeroTrade:    { before: around(300), after: around(298) },
}, { declaredRegime: 'tradeBearing' });
check('improves one, other arm certified flat => PASS', clean.pass, true);

console.log('\n=== scope declared honestly: cannot move the other arm ===');
const scoped = verdict({
  tradeBearing: { before: around(600), after: around(601) },
  zeroTrade:    { before: around(300), after: around(210) },
}, { declaredRegime: 'zeroTrade' });
check('declared arm improves, other certified flat => PASS', scoped.pass, true);

console.log('\n=== the arm that was never run ===');
const missing = verdict({ zeroTrade: { before: around(300), after: around(210) } },
  { declaredRegime: 'zeroTrade' });
check('one arm unmeasured => FAIL', missing.pass, false);
check('  and says so', /both arms must be measured/.test(missing.reason), true);

console.log('\n=== underpowered: n=1 cannot see a regression, so it cannot certify one absent ===');
const thin = verdict({
  tradeBearing: { before: [600], after: [400] },
  zeroTrade:    { before: [300], after: [330] },
}, { declaredRegime: 'tradeBearing' });
check('n=1 => FAIL', thin.pass, false);
check('  for underpowering, not for the regression', /n<3/.test(thin.reason), true);

console.log('\n=== THE SUBTLE ONE: not significant is not the same as not there ===');
// +5% drift on the other arm. Too small to call a regression at this n, too large to rule one out.
// The naive reading of "neither may worsen" passes this. It must not.
const undetected = verdict({
  tradeBearing: { before: around(600), after: around(400) },
  zeroTrade:    { before: around(300), after: around(315) },
}, { declaredRegime: 'tradeBearing' });
check('undetectable-but-unruled-out drift => FAIL', undetected.pass, false);
check('  and asks for repeats rather than calling it a regression',
  /NOT CERTIFIED/.test(undetected.reason) && /Add repeats/.test(undetected.reason), true);

console.log('\n=== and repeats are what fixes it ===');
const wide = verdict({
  tradeBearing: { before: around(600, 12), after: around(400, 12) },
  zeroTrade:    { before: around(300, 12), after: around(301, 12) },
}, { declaredRegime: 'tradeBearing' });
check('same flat arm at n=12 => PASS', wide.pass, true);

console.log('\n=== a fix that improves the wrong arm ===');
const wrong = verdict({
  tradeBearing: { before: around(600), after: around(400) },
  zeroTrade:    { before: around(300), after: around(299) },
}, { declaredRegime: 'zeroTrade' });
check('declared zeroTrade but only tradeBearing moved => FAIL', wrong.pass, false);

console.log('\n=== nothing happened ===');
const nul = verdict({
  tradeBearing: { before: around(600), after: around(598) },
  zeroTrade:    { before: around(300), after: around(301) },
}, { declaredRegime: 'zeroTrade' });
check('no arm improved => FAIL', nul.pass, false);

console.log('\n=== a change smaller than the instrument is not a result ===');
const noise = verdict({
  tradeBearing: { before: around(600), after: around(585) },   // 2.5%
  zeroTrade:    { before: around(300), after: around(300) },
}, { declaredRegime: 'tradeBearing' });
check('2.5% "improvement" => FAIL, inside the noise', noise.pass, false);

console.log('\n=== three tight samples must not buy precision the instrument lacks ===');
const tight = verdict({
  tradeBearing: { before: [600, 600.1, 599.9], after: [585, 585.1, 584.9] },
  zeroTrade:    { before: [300, 300.1, 299.9], after: [300, 300.1, 299.9] },
}, { declaredRegime: 'tradeBearing' });
check('sd~0.1 across 3 samples does not certify a 2.5% move', tight.pass, false);

console.log('\n=== detectable delta shrinks with repeats ===');
const d1 = detectableDelta(300, 1), d3 = detectableDelta(300, 3), d8 = detectableDelta(300, 8);
console.log(`  n=1 ${d1.toFixed(1)} ms/s   n=3 ${d3.toFixed(1)}   n=8 ${d8.toFixed(1)}`);
check('more repeats resolve smaller differences', d1 > d3 && d3 > d8, true);

console.log(`\n================ ${pass} passed, ${fail} failed ================`);
process.exit(fail ? 1 : 0);
