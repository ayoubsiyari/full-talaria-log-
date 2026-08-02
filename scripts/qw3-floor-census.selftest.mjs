/**
 * Self-test for the QW3-FLOOR-CENSUS binding grader.
 *
 * The whole run turns on one verdict: does the QW-3 flag bind on the served build? A grader that returns
 * the wrong state here either fabricates a blocker or, far worse, waves through a FALSE NULL that reads as
 * "keeping the cache is free". The case that matters most is the fourth: a broken counting getter reads
 * zero exactly like a non-binding flag, and only the control flag can tell them apart.
 */

process.argv.push('--noRun');
const { gradeBinding } = await import('./qw3-floor-census.mjs');

const QW3 = '__TALARIA_DISABLE_QW3_RESAMPLE_CACHE_KEEP_V1';
const CTL = '__TALARIA_DISABLE_M20_PREFIX_SLICE_V1';
const c = (qw3, ctl) => [{ realm: 'host', counts: { [QW3]: qw3, [CTL]: ctl } }];

let pass = 0; let fail = 0;
const check = (name, got, want) => {
  if (got === want) { pass++; console.log(`  PASS  ${name}  -> ${got}`); }
  else { fail++; console.log(`  FAIL  ${name}  -> got ${got}, want ${want}`); }
};

console.log('QW3-FLOOR-CENSUS binding grader self-test\n');

check('flag absent from served build (control alive)',
  gradeBinding(c(0, 412), ['undefined']).state, 'RESOLVER_ABSENT_FROM_SERVED_BUILD');

check('method present but flag never consulted',
  gradeBinding(c(0, 412), ['function']).state, 'RESOLVER_PRESENT_BUT_UNCALLED');

check('flag consulted — an A/B would bind',
  gradeBinding(c(88, 412), ['function']).state, 'RESOLVER_CALLED');

check('DEAD MECHANISM must not read as a blocker: control zero too',
  gradeBinding(c(0, 0), ['undefined']).state, 'PROVES_NOTHING');

check('dead mechanism outranks a present method',
  gradeBinding(c(0, 0), ['function']).state, 'PROVES_NOTHING');

check('counts summed across realms',
  gradeBinding([{ realm: 'host', counts: { [QW3]: 0, [CTL]: 5 } }, { realm: 'frame0', counts: { [QW3]: 3, [CTL]: 7 } }], ['function']).qw3Reads, 3);

check('missing counts object does not throw',
  gradeBinding([{ realm: 'host', counts: null }, { realm: 'f0', counts: { [QW3]: 0, [CTL]: 9 } }], ['undefined']).state,
  'RESOLVER_ABSENT_FROM_SERVED_BUILD');

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
