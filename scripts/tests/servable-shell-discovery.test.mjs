import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_ROOTS,
  DISCOVERY_SIGNATURE,
  PARSE_HAZARDS,
  discoverShells,
  normalizeLoaderOrder,
  referencesChartEngine,
  shellFacts,
  tokenizeShellDocument,
} from '../lib/servable-shell-discovery.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const ROOTS = ['chart v 1.4', 'homepage/public', 'homepage/out'];
const FACT_KEYS = [
  'path',
  'sizeBytes',
  'stampTokens',
  'scriptSrcs',
  'loaderDigest',
  'scriptCount',
  'referencesChartJs',
  'parseComplete',
  'parseIncompleteReasons',
];

function toPosix(value) {
  return value.replaceAll('\\', '/');
}

function independentHtmlFiles(directory, relativeDirectory, found = []) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const relative = `${relativeDirectory}/${entry.name}`;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      independentHtmlFiles(absolute, relative, found);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      found.push(toPosix(relative));
    }
  }
  return found;
}

function independentAllHtmlFiles() {
  return ROOTS.flatMap((relativeRoot) =>
    independentHtmlFiles(path.join(root, ...relativeRoot.split('/')), relativeRoot));
}

function assertRequiredScript(html, requiredScript) {
  const facts = shellFacts(html, 'fixture/index.html');
  assert.equal(facts.parseComplete, true, 'parse incomplete');
  assert.ok(facts.scriptSrcs.includes(requiredScript), 'required script absent');
  return true;
}

test('live repository enumeration is complete against an independent walk', () => {
  const expected = independentAllHtmlFiles().sort();
  const discovered = discoverShells({ root, roots: ROOTS });
  assert.equal(discovered.signature, DISCOVERY_SIGNATURE);
  assert.deepEqual(discovered.roots, ROOTS);
  assert.equal(discovered.shells.length, expected.length);
  assert.deepEqual(discovered.shells.map((shell) => shell.path), expected);
  for (const facts of discovered.shells) {
    assert.deepEqual(Object.keys(facts), FACT_KEYS);
  }
});

test('missing roots fail closed instead of yielding an empty inventory', () => {
  const alternateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-shell-missing-'));
  try {
    assert.throws(
      () => discoverShells({ root: alternateRoot, roots: ['missing-root'] }),
      /ENOENT|no such file|cannot find/i,
    );
  } finally {
    fs.rmSync(alternateRoot, { recursive: true, force: true });
  }
});

test('three consecutive discovery runs are byte-identical', () => {
  const runs = [1, 2, 3].map(() => JSON.stringify(discoverShells({ root, roots: ROOTS })));
  assert.equal(new Set(runs).size, 1);
});

test('alternate root and clock preserve facts modulo path prefix', () => {
  const live = discoverShells({ root, roots: ROOTS });
  const fixtures = live.shells.slice(0, 5);
  assert.ok(fixtures.length > 0, 'fixture selection absent');

  const alternateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-shell-alt-'));
  const beforeNow = Date.now;
  try {
    for (const facts of fixtures) {
      const destination = path.join(alternateRoot, 'mirror', ...facts.path.split('/'));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, ...facts.path.split('/')), destination);
    }

    Date.now = () => 1;
    const alternate = discoverShells({ root: alternateRoot, roots: ['mirror'] }).shells
      .map((facts) => ({ ...facts, path: facts.path.replace(/^mirror\//, '') }));
    assert.deepEqual(alternate, fixtures);
  } finally {
    Date.now = beforeNow;
    fs.rmSync(alternateRoot, { recursive: true, force: true });
  }
});

test('payloads contain no absolute paths, wall-clock values or UUIDs', () => {
  const beforeNow = Date.now;
  Date.now = () => 9876543210123;
  try {
    const payload = JSON.stringify(discoverShells({ root, roots: ROOTS }));
    assert.equal(payload.includes(toPosix(root)), false, 'payload leaked posix absolute root');
    assert.equal(payload.includes(root), false, 'payload leaked native absolute root');
    assert.doesNotMatch(payload, /(^|["\s])[A-Za-z]:[\\/]/, 'payload leaked a Windows absolute path');
    assert.doesNotMatch(payload, /9876543210123/, 'payload leaked Date.now');
    assert.doesNotMatch(payload, /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
    assert.doesNotMatch(payload, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  } finally {
    Date.now = beforeNow;
  }
});

test('four-state anti-lying proof', () => {
  const required = '/chart/modules/indicator-performance.js';
  const good = [
    '<!doctype html>',
    '<script defer src="/chart/chart.js?v=20260727b80"></script>',
    `<script>inject('${required}?v=20260727b80')</script>`,
  ].join('\n');
  const removed = good.replace(`<script>inject('${required}?v=20260727b80')</script>`, '');
  const corrupted = good.replace(`'${required}?v=20260727b80'`, 'requiredScript');

  assert.equal(assertRequiredScript(good, required), true, 'fixed state passes');
  assert.throws(() => assertRequiredScript(removed, required), /required script absent/, 'broken state fails');
  assert.throws(() => assertRequiredScript(corrupted, required), /parse incomplete/, 'corrupted input fails');
  assert.throws(
    () => assert.equal(assertRequiredScript(good, required), false),
    /true !== false/,
    'inverted assertion flips',
  );
});

test('extractor handles script src inject host loader paths arrays and cache stripping', () => {
  const html = [
    '<!doctype html>',
    '<script defer src="/chart/chart.js?v=20260727b80"></script>',
    '<script>',
    'inject("/chart/modules/first.js?v=20260727b80");',
    "__loadHostOnlyScript('/chart/modules/second.js?cache=abc');",
    'var paths = [',
    '  "/chart/modules/third.js?v=20260727b80",',
    "  '/chart/modules/fourth.mjs?cache=def'",
    '];',
    '</script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/index.html');
  const expectedScripts = [
    '/chart/chart.js',
    '/chart/modules/first.js',
    '/chart/modules/second.js',
    '/chart/modules/third.js',
    '/chart/modules/fourth.mjs',
  ];

  assert.deepEqual(facts.scriptSrcs, expectedScripts);
  assert.equal(facts.loaderDigest, normalizeLoaderOrder(expectedScripts).digest);
  assert.equal(facts.scriptCount, 2);
  assert.equal(facts.referencesChartJs, true);
  assert.equal(facts.parseComplete, true);
  assert.deepEqual(facts.stampTokens, ['20260727b80']);
});

test('inject helper with literal calls is parse-complete', () => {
  const html = [
    '<!doctype html>',
    '<script>',
    'function inject(src) {',
    "  var s = document.createElement('script');",
    "  s.src = src + '?v=20260727b80';",
    '  document.head.appendChild(s);',
    '}',
    "inject('/chart/chart.js');",
    "inject('/chart/modules/alerts.mjs?v=20260727b80');",
    '</script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/index.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/chart.js', '/chart/modules/alerts.mjs']);
  assert.equal(facts.parseComplete, true);
});

test('assigned host-only script helper with literal call is parse-complete', () => {
  const html = [
    '<!doctype html>',
    '<script>',
    'const __loadHostOnlyScript = function(src) {',
    '  const script = document.createElement("script");',
    '  script.src = src;',
    '  document.head.appendChild(script);',
    '};',
    "__loadHostOnlyScript('/chart/modules/host-only.js');",
    '</script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/host.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/modules/host-only.js']);
  assert.equal(facts.parseComplete, true);
});

test('inject helper with non-literal call is parse-incomplete', () => {
  const html = [
    '<!doctype html>',
    '<script>',
    'function inject(src) {',
    "  var s = document.createElement('script');",
    '  s.src = src;',
    '  document.head.appendChild(s);',
    '}',
    "const moduleName = '/chart/modules/dynamic.js';",
    'inject(moduleName);',
    '</script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/dynamic.html');
  assert.deepEqual(facts.scriptSrcs, []);
  assert.equal(facts.parseComplete, false);
});

test('bare script element creation remains parse-incomplete', () => {
  const html = [
    '<!doctype html>',
    '<script>',
    'const script = document.createElement("script");',
    "script.src = '/chart/modules/runtime.js';",
    'document.head.appendChild(script);',
    '</script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/runtime.html');
  assert.deepEqual(facts.scriptSrcs, []);
  assert.equal(facts.parseComplete, false);
});

test('static script tags remain parse-complete', () => {
  const html = [
    '<!doctype html>',
    '<script defer src="/chart/chart.js?v=20260727b80"></script>',
    '<script type="module" src="/chart/modules/app.mjs#boot"></script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/static.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/chart.js', '/chart/modules/app.mjs']);
  assert.equal(facts.parseComplete, true);
});

test('importScripts still marks parse-incomplete', () => {
  const html = [
    '<!doctype html>',
    '<script>',
    "importScripts('/chart/modules/worker.js');",
    '</script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/worker.html');
  assert.deepEqual(facts.scriptSrcs, []);
  assert.equal(facts.parseComplete, false);
});

test('F6: commented and stringified script tags are ignored', () => {
  const html = [
    '<!doctype html>',
    '<!-- <script src="/chart/modules/commented.js"></script> -->',
    '<script>',
    'const fixture = "<script src=\\"/chart/modules/stringified.js\\"></script>";',
    '</script>',
    '<script defer src="/chart/modules/real.js?v=20260727b80"></script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/comment-string.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/modules/real.js']);
  assert.equal(facts.parseComplete, true);
});

test('F6: document.write script injection outside helpers is parse-incomplete', () => {
  const html = [
    '<!doctype html>',
    '<script>',
    'document.write("<script src=\\"/chart/modules/dynamic.js\\"></script>");',
    '</script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/document-write.html');
  assert.deepEqual(facts.scriptSrcs, []);
  assert.equal(facts.parseComplete, false);
  assert.deepEqual(facts.parseIncompleteReasons, [PARSE_HAZARDS.documentWrite]);
});

// The second review's attack: an HTML comment opener living inside a JavaScript string. If
// HTML comments are stripped before inline script strings are blanked, the `<!--` in the
// string pairs with a later `-->` and everything between them — including a real forbidden
// <script src> — vanishes from the scan while parseComplete stays true.
test('F6 ATTACK: a "<!--" inside a script string cannot hide a later script src', () => {
  const html = [
    '<!doctype html>',
    '<script>',
    'var opener = "<!--";',
    '</script>',
    '<script defer src="/chart/modules/host-only.js?v=20260727b80"></script>',
    '<!-- the first -->  closes the straddle the attacker was relying on -->',
    '<script defer src="/chart/modules/real.js?v=20260727b80"></script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/comment-straddle.html');
  assert.deepEqual(facts.scriptSrcs, [
    '/chart/modules/host-only.js',
    '/chart/modules/real.js',
  ]);
  assert.equal(facts.parseComplete, true);
  assert.deepEqual(facts.parseIncompleteReasons, []);
});

test('F6 ATTACK: a template-literal comment opener cannot hide a script src either', () => {
  const html = [
    '<!doctype html>',
    '<script>',
    'const banner = `<!-- talaria`;',
    '</script>',
    '<script defer src="/chart/modules/hidden.js"></script>',
    '<!-- tail -->',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/template-straddle.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/modules/hidden.js']);
  assert.equal(facts.parseComplete, true);
});

test('F6 four-state proof on the comment-straddle attack', () => {
  const hidden = '/chart/modules/host-only.js';
  const attack = [
    '<!doctype html>',
    '<script>var opener = "<!--";</script>',
    `<script defer src="${hidden}"></script>`,
    '<!-- tail -->',
  ].join('\n');
  const fixedState = () => shellFacts(attack, 'chart v 1.4/chart/straddle.html').scriptSrcs.includes(hidden);
  const brokenState = () => shellFacts(
    attack.replace(`<script defer src="${hidden}"></script>`, ''),
    'chart v 1.4/chart/straddle.html',
  ).scriptSrcs.includes(hidden);
  const corruptedState = () => shellFacts(
    attack.replace(`src="${hidden}"`, 'src=data'),
    'chart v 1.4/chart/straddle.html',
  ).parseComplete;

  assert.equal(fixedState(), true, 'fixed state sees the straddled script');
  assert.equal(brokenState(), false, 'broken state loses the script');
  assert.equal(corruptedState(), true, 'unquoted src is still readable');
  assert.throws(() => assert.equal(fixedState(), false), /true !== false/, 'inverted assertion flips');
});

// Live invariant: the V9 host shells load their host-only modules through a document.write
// inside window.__loadHostOnlyScript. That recognized helper must stay parse-complete, or the
// exposure and required-module checks on the canonical hosts are silently suppressed.
test('F6: document.write inside a recognized loader helper stays parse-complete', () => {
  const html = [
    '<!doctype html>',
    '<script>',
    '(function () {',
    '    window.__loadHostOnlyScript = function (path) {',
    '        if (window.__TALARIA_EMBED_LITE) return;',
    "        var v = window.__TALARIA_CHART_BUILD_ID ? ('?v=' + window.__TALARIA_CHART_BUILD_ID) : '';",
    '        document.write(\'<script defer src="\' + path + v + \'"><\\/\' + \'script>\');',
    '    };',
    '})();',
    '</script>',
    "<script>window.__loadHostOnlyScript('/chart/modules/compare-overlay.js');</script>",
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/dist-v9/index.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/modules/compare-overlay.js']);
  assert.equal(facts.parseComplete, true);
});

test('F6: document.write outside a helper is parse-incomplete even without a literal script tag', () => {
  const html = [
    '<!doctype html>',
    '<script>',
    'var tag = "scr" + "ipt";',
    'document.write("<" + tag + \' src="/chart/modules/assembled.js"></\' + tag + ">");',
    '</script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/assembled.html');
  assert.equal(facts.parseComplete, false);
  assert.deepEqual(facts.parseIncompleteReasons, [PARSE_HAZARDS.documentWrite]);
});

test('F6: ES imports, workers and import maps are parse-incomplete', () => {
  const cases = [
    [PARSE_HAZARDS.esImport, '<script type="module">import { boot } from "/chart/modules/boot.mjs";</script>'],
    [PARSE_HAZARDS.esImport, '<script type="module">import "/chart/modules/side-effect.mjs";</script>'],
    [PARSE_HAZARDS.esImport, '<script>window.later = () => import("/chart/modules/lazy.mjs");</script>'],
    [PARSE_HAZARDS.worker, '<script>var w = new Worker("/chart/modules/worker.js");</script>'],
    [PARSE_HAZARDS.worker, '<script>var w = new SharedWorker("/chart/modules/shared.js");</script>'],
    [PARSE_HAZARDS.importMap, '<script type="importmap">{"imports":{"chart":"/chart/chart.js"}}</script>'],
  ];
  for (const [reason, block] of cases) {
    const facts = shellFacts(`<!doctype html>\n${block}\n`, 'chart v 1.4/chart/dynamic.html');
    assert.equal(facts.parseComplete, false, block);
    assert.deepEqual(facts.parseIncompleteReasons, [reason], block);
  }
});

test('F6: the word import in prose, comments and strings is not a dynamic load', () => {
  const html = [
    '<!doctype html>',
    '<p>Delete every dataset before this import (requires confirmation)</p>',
    '<!-- FirstRate import (step layout) -->',
    '<script>',
    '/* FirstRate import (step layout) */',
    "var label = 'Import (restore) ' + n + ' ticket';",
    "var help = 'Need import (restore to inbox)';",
    "var note = 'import \"/chart/modules/not-loaded.mjs\"';",
    '</script>',
    '<script defer src="/chart/modules/real.js"></script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/admin-dashboard.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/modules/real.js']);
  assert.deepEqual(facts.parseIncompleteReasons, []);
  assert.equal(facts.parseComplete, true);
});

test('F6: an external module script does not blank its own body scan', () => {
  const html = [
    '<!doctype html>',
    '<script type="module" src="/chart/modules/app.mjs"></script>',
    '<script>var w = new Worker("/chart/modules/worker.js");</script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/module-host.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/modules/app.mjs']);
  assert.deepEqual(facts.parseIncompleteReasons, [PARSE_HAZARDS.worker]);
});

// The three scan views share one index space, which only holds if blanking a script body is
// length-preserving. Escapes, template literals and comment terminators at awkward offsets are
// where a length shift would appear, and a shift would desynchronise the comment mask.
// The inverse of the string-as-carrier cell above, and the reason the two passes had to
// collapse into one walk. Here the *comment* is the carrier. A browser closes the comment at
// the first `-->` and then loads /chart/chart.js; a scanner that opens a script region on the
// `<script` living inside that comment blanks the rest of the line as script text, pairs the
// opening `<!--` with the trailing `-->`, and reports an empty loader graph with nothing
// unresolved. Whichever pass runs first can be handed a false region by the other's carrier,
// which is why there is no sound order — only one interleaved walk.
const COMMENT_CARRIER = '<!-- <script>var x = " --><script src="/chart/chart.js"></script><!-- ";</script> -->';

test('F6 ATTACK: a comment cannot carry a script opener that swallows the real loader', () => {
  const facts = shellFacts(`<!doctype html>\n${COMMENT_CARRIER}\n`, 'chart v 1.4/chart/comment-carrier.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/chart.js']);
  assert.equal(facts.referencesChartJs, true, 'the chart engine binding must survive the carrier');
  assert.equal(facts.parseComplete, true);
  assert.deepEqual(facts.parseIncompleteReasons, []);
  assert.equal(facts.scriptCount, 1, 'only the element the browser opens is a script element');
});

test('F6 four-state proof on the comment-carrier attack', () => {
  const engine = '/chart/chart.js';
  const document = `<!doctype html>\n${COMMENT_CARRIER}\n`;
  const fixedState = () => shellFacts(document, 'chart v 1.4/chart/carrier.html').scriptSrcs.includes(engine);
  const brokenState = () => shellFacts(
    document.replace(`<script src="${engine}"></script>`, ''),
    'chart v 1.4/chart/carrier.html',
  ).scriptSrcs.includes(engine);
  const corruptedState = () => shellFacts(
    document.replace(`src="${engine}"`, 'src=""'),
    'chart v 1.4/chart/carrier.html',
  ).parseIncompleteReasons;

  assert.equal(fixedState(), true, 'fixed state sees the script the browser loads');
  assert.equal(brokenState(), false, 'broken state loses the script');
  assert.deepEqual(corruptedState(), [PARSE_HAZARDS.scriptSrcUnreadable], 'an unreadable src fails closed');
  assert.throws(() => assert.equal(fixedState(), false), /true !== false/, 'inverted assertion flips');
});

// Both carriers in one document, in both orders. A scan order that favours either construct
// loses the loader on one of these two inputs; the walk must be indifferent to which comes first.
test('F6: neither carrier wins by going first', () => {
  const stringCarrier = '<script>var opener = "<!--";</script>';
  const documents = [
    ['string carrier first', [
      '<!doctype html>',
      stringCarrier,
      '<script src="/chart/modules/one.js"></script>',
      COMMENT_CARRIER.replace('/chart/chart.js', '/chart/modules/two.js'),
      '<script src="/chart/modules/three.js"></script>',
    ].join('\n'), ['/chart/modules/one.js', '/chart/modules/two.js', '/chart/modules/three.js']],
    ['comment carrier first', [
      '<!doctype html>',
      COMMENT_CARRIER.replace('/chart/chart.js', '/chart/modules/two.js'),
      stringCarrier,
      '<script src="/chart/modules/one.js"></script>',
      '<!-- tail -->',
      '<script src="/chart/modules/three.js"></script>',
    ].join('\n'), ['/chart/modules/two.js', '/chart/modules/one.js', '/chart/modules/three.js']],
  ];

  for (const [label, document, expected] of documents) {
    const facts = shellFacts(document, 'chart v 1.4/chart/both-carriers.html');
    assert.deepEqual(facts.scriptSrcs, expected, label);
    assert.equal(facts.parseComplete, true, label);
  }
});

// Same class of attack, other carriers. An attribute value and a raw-text element body are
// both places where `<!--` is ordinary text to a browser and a comment opener to a scanner
// that looks for comments without first knowing where the markup boundaries are.
test('F6 ATTACK: attribute values and raw-text bodies cannot carry a comment opener', () => {
  const cases = [
    ['quoted attribute value', [
      '<div data-note="<!--"></div>',
      '<script src="/chart/modules/hidden.js"></script>',
      '<!-- tail -->',
    ].join('\n')],
    ['textarea raw text', [
      '<textarea><!--</textarea>',
      '<script src="/chart/modules/hidden.js"></script>',
      '<!--></textarea>',
    ].join('\n')],
    ['title raw text', [
      '<title><!--</title>',
      '<script src="/chart/modules/hidden.js"></script>',
      '<!-- tail -->',
    ].join('\n')],
    ['style raw text', [
      '<style>/* <!-- */</style>',
      '<script src="/chart/modules/hidden.js"></script>',
      '<!-- tail -->',
    ].join('\n')],
  ];

  for (const [label, body] of cases) {
    const facts = shellFacts(`<!doctype html>\n${body}\n`, 'chart v 1.4/chart/carrier.html');
    assert.deepEqual(facts.scriptSrcs, ['/chart/modules/hidden.js'], label);
    assert.equal(facts.parseComplete, true, label);
  }
});

// The mirror obligation: over-reporting is not free either. A `<script src>` inside a raw-text
// body or a comment is never fetched, and reporting it would fail a module contract the shell
// does not actually break.
test('F6: script tags inside comments and raw-text bodies are not loads', () => {
  const html = [
    '<!doctype html>',
    '<!-- <script src="/chart/modules/commented.js"></script> -->',
    '<textarea><script src="/chart/modules/typed.js"></script></textarea>',
    '<title><script src="/chart/modules/titled.js"></script></title>',
    '<noscript><script src="/chart/modules/fallback.js"></script></noscript>',
    '<script src="/chart/modules/real.js"></script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/inert.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/modules/real.js']);
  assert.equal(facts.scriptCount, 1);
  assert.equal(facts.parseComplete, true);
});

test('F6: script tags inside depth-counted template bodies are inert', () => {
  const html = [
    '<!doctype html>',
    '<template>',
    '  <script src="/chart/modules/template-only.js"></script>',
    '  <template><script src="/chart/modules/nested-template.js"></script></template>',
    '</template>',
    '<script src="/chart/modules/real.js"></script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/template-inert.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/modules/real.js']);
  assert.equal(facts.scriptCount, 1);
  assert.equal(facts.parseComplete, true);
});

test('R-W22 R4 ATTACK: a self-closing slash on template is ignored in HTML', () => {
  const html = [
    '<!doctype html>',
    '<template/>',
    '<script src="/chart/modules/parked-after-template.js"></script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/self-closing-template.html');
  assert.deepEqual(facts.scriptSrcs, []);
  assert.equal(facts.scriptCount, 0);
  assert.equal(facts.parseComplete, true);
});

// The three W25 witnesses. Inside foreign content a `style`, `script` or `template` start tag
// is an ordinary foreign element with markup contents, so it never opens a raw-text region and
// never swallows the `</template>` that follows. They are re-pinned here rather than folded into
// the W26 cells below: the stack rewrite has to keep them green, and a later author reading only
// the W26 cells must not be able to conclude that these three stopped mattering.
// The `foreign style` case carries the W26-N1 hazard because a `<style>` start tag inside
// foreign content is markup whose content model this walk cannot settle; what these cells pin
// is the part that must not move — the engine binding behind the `</template>` stays visible.
test('W24-F1/W25 ATTACK: foreign content inside template cannot hide the following engine script', () => {
  const cases = [
    ['foreign style', '<template><svg><style></template><script src="/chart/chart.js"></script>', [PARSE_HAZARDS.rawTextForeignContent]],
    ['foreign script', '<template><svg><script></template><script src="/chart/chart.js"></script>', []],
    ['foreign self-closing template', '<template><svg><template/></template><script src="/chart/chart.js"></script>', []],
  ];

  for (const [label, body, expected] of cases) {
    const facts = shellFacts(`<!doctype html>\n${body}\n`, 'chart v 1.4/chart/template-foreign.html');
    assert.deepEqual(facts.scriptSrcs, ['/chart/chart.js'], label);
    assert.equal(facts.scriptCount, 1, label);
    assert.equal(facts.referencesChartJs, true, label);
    assert.deepEqual(facts.parseIncompleteReasons, expected, label);
    assert.equal(facts.parseComplete, expected.length === 0, label);
  }
});

// W26. The witnesses above were closed by tracking foreign content as a depth counter, and a
// counter carries no element identity: `</math>` decremented it even when the only open foreign
// element was `<svg>`. A browser ignores that token — foreign content's end-tag walk pops only
// when it finds the name up the chain, and both "in body" and "in template" ignore an end tag
// for an element that was never opened. So the counter reached zero one token early, the
// raw-text branch reopened, and an unterminated `<style>` swallowed both the `</template>` and
// the engine script behind it: an empty loader graph at parseComplete=true, which is the exact
// silent miss the W25 cells exist to forbid, reachable by adding one token to them. A stack of
// open foreign element names is what tells "pop" apart from "ignore".
test('W26-F1 ATTACK: an unmatched foreign end tag cannot reopen the raw-text branch in a template', () => {
  const rawTextInForeign = [PARSE_HAZARDS.rawTextForeignContent];
  const cases = [
    ['stray /math, style carrier', '<template><svg></math><style></template><script src="/chart/chart.js"></script>', rawTextInForeign],
    ['stray /svg, style carrier', '<template><math></svg><style></template><script src="/chart/chart.js"></script>', rawTextInForeign],
    ['stray /math, script carrier', '<template><svg></math><script></template><script src="/chart/chart.js"></script>', []],
    ['stray /math, title carrier', '<template><svg></math><title></template><script src="/chart/chart.js"></script>', rawTextInForeign],
    ['stray /math under nested svg', '<template><svg><svg></math><style></template><script src="/chart/chart.js"></script>', rawTextInForeign],
  ];

  for (const [label, body, expected] of cases) {
    const facts = shellFacts(`<!doctype html>\n${body}\n`, 'chart v 1.4/chart/template-foreign-stray.html');
    assert.deepEqual(facts.scriptSrcs, ['/chart/chart.js'], label);
    assert.equal(facts.scriptCount, 1, label);
    assert.equal(facts.referencesChartJs, true, label);
    assert.deepEqual(facts.parseIncompleteReasons, expected, label);
    assert.equal(facts.parseComplete, expected.length === 0, label);
  }
});

// The same arithmetic with no template involved. `<p>` is on the foreign-content breakout list,
// so a browser pops the `style` and the `svg` and loads the following tag as an ordinary HTML
// script. The walk does not model breakout tags, so it keeps the script inside foreign content —
// which still names it as a load and fails the shell closed on script-in-foreign-content. Either
// outcome is answerable; what the shell may never be is an empty loader graph at
// parseComplete=true, and under the counter that is exactly what it was.
test('W26-F2 ATTACK: an unmatched foreign end tag cannot hide the engine at top level', () => {
  const cases = [
    ['stray /math', '<svg></math><style><p><script src="/chart/chart.js"></script>'],
    ['stray /svg', '<math></svg><style><p><script src="/chart/chart.js"></script>'],
  ];

  for (const [label, body] of cases) {
    const facts = shellFacts(`<!doctype html>\n${body}\n`, 'chart v 1.4/chart/foreign-stray.html');
    assert.deepEqual(facts.scriptSrcs, ['/chart/chart.js'], label);
    assert.equal(facts.scriptCount, 1, label);
    assert.equal(facts.referencesChartJs, true, label);
    assert.equal(facts.parseComplete, false, label);
    assert.deepEqual(facts.parseIncompleteReasons, [
      PARSE_HAZARDS.rawTextForeignContent,
      PARSE_HAZARDS.scriptForeignContent,
    ].sort(), label);
  }
});

test('W26 four-state proof on the stray foreign end tag, in a template and at top level', () => {
  const engine = '/chart/chart.js';
  const loader = `<script src="${engine}"></script>`;
  const witnesses = [
    // The corrupted state of the top-level carrier fails closed twice over: the src is
    // unreadable and the script is still inside unclosed foreign content.
    ['template carrier', `<!doctype html>\n<template><svg></math><style></template>${loader}\n`, [
      PARSE_HAZARDS.rawTextForeignContent,
      PARSE_HAZARDS.scriptSrcUnreadable,
    ]],
    ['top-level carrier', `<!doctype html>\n<svg></math><style><p>${loader}\n`, [
      PARSE_HAZARDS.rawTextForeignContent,
      PARSE_HAZARDS.scriptForeignContent,
      PARSE_HAZARDS.scriptSrcUnreadable,
    ]],
  ];
  const factsOf = (document) => shellFacts(document, 'chart v 1.4/chart/stray-foreign.html');

  for (const [label, witness, corruptedReasons] of witnesses) {
    assert.equal(factsOf(witness).referencesChartJs, true, `${label}: fixed state sees the engine`);
    assert.equal(
      factsOf(witness.replace(loader, '')).referencesChartJs,
      false,
      `${label}: broken state loses the engine, so the assertion above is load-bearing`,
    );
    const corrupted = factsOf(witness.replace(`src="${engine}"`, 'src="&notarealreference;/chart/chart.js"'));
    assert.deepEqual(corrupted.scriptSrcs, [], `${label}: an unreadable src is not credited as a load`);
    assert.deepEqual(
      corrupted.parseIncompleteReasons,
      [...corruptedReasons].sort(),
      `${label}: an unreadable src fails closed rather than being dropped`,
    );
    assert.equal(corrupted.parseComplete, false, `${label}: corrupted input is not parse-complete`);
    assert.throws(
      () => assert.equal(factsOf(witness).referencesChartJs, false),
      /true !== false/,
      `${label}: inverted assertion flips`,
    );
  }
});

// The mirror of the same defect, in the over-reporting direction. The end-tag walk pops up to and
// including the entry it matched, so `</svg>` with `<svg><math>` open closes both; a counter left
// the walk one level deep and reported the HTML script that follows as living in foreign content,
// failing a shell closed on a hazard it does not have. A same-named nesting still pops exactly one
// level, which is the case that proves the stack is being searched rather than emptied.
test('W26: a matched foreign end tag pops everything nested inside it, and no more', () => {
  const popped = shellFacts(
    '<!doctype html>\n<svg><math></svg><style></style><script src="/chart/chart.js"></script>\n',
    'chart v 1.4/chart/foreign-nested-pop.html',
  );
  assert.deepEqual(popped.scriptSrcs, ['/chart/chart.js']);
  assert.equal(popped.parseComplete, true);
  assert.deepEqual(popped.parseIncompleteReasons, []);

  const stillOpen = shellFacts(
    '<!doctype html>\n<svg><svg></svg><script src="/chart/chart.js"></script>\n',
    'chart v 1.4/chart/foreign-one-level.html',
  );
  assert.deepEqual(stillOpen.scriptSrcs, ['/chart/chart.js']);
  assert.equal(stillOpen.parseComplete, false);
  assert.deepEqual(stillOpen.parseIncompleteReasons, [PARSE_HAZARDS.scriptForeignContent]);

  const bothClosed = shellFacts(
    '<!doctype html>\n<svg><svg></svg></svg><script src="/chart/chart.js"></script>\n',
    'chart v 1.4/chart/foreign-both-closed.html',
  );
  assert.deepEqual(bothClosed.scriptSrcs, ['/chart/chart.js']);
  assert.equal(bothClosed.parseComplete, true);
});

// A foreign end tag with nothing open is ignored, not an underflow: the document stays in HTML
// content, so a properly terminated raw-text element still ends where it ends, and a foreign
// element opened afterwards still takes effect.
test('W26: a foreign end tag with nothing open leaves the walk in HTML content', () => {
  const ignored = shellFacts(
    '<!doctype html>\n</svg></math><style></style><script src="/chart/chart.js"></script>\n',
    'chart v 1.4/chart/foreign-underflow.html',
  );
  assert.deepEqual(ignored.scriptSrcs, ['/chart/chart.js']);
  assert.equal(ignored.parseComplete, true);
  assert.deepEqual(ignored.parseIncompleteReasons, []);

  const reopened = shellFacts(
    '<!doctype html>\n</math><svg><style><script src="/chart/chart.js"></script>\n',
    'chart v 1.4/chart/foreign-reopened.html',
  );
  assert.deepEqual(reopened.scriptSrcs, ['/chart/chart.js']);
  assert.deepEqual(reopened.parseIncompleteReasons, [
    PARSE_HAZARDS.rawTextForeignContent,
    PARSE_HAZARDS.scriptForeignContent,
  ].sort());
});

// W26-N1. The comment above the walk used to argue that the unmodelled foreign-content
// behaviours could only ever cost an over-report, because the walk stays in foreign content
// longer than a browser does. The HTML integration points falsify that. `desc`, `title` and
// `foreignObject` in SVG, and `mi`/`mo`/`mn`/`ms`/`mtext` in MathML, hand their contents back to
// HTML rules, so a raw-text start tag inside one really does switch the tokenizer to text — and
// the text it then eats is the `</svg>` the walk was relying on. One token later the walk is in
// HTML content where the browser is still reading text, opens a `<style>` the browser never
// opened, and swallows the engine binding behind it: empty loader graph, parseComplete=true,
// which is the one report this scanner may never produce.
//
// The fix is a hazard rather than a wider region model. Inside genuine foreign content these
// same tags are ordinary elements with markup contents, and consuming them as raw text would
// re-open the W25 hole from the other side (`<svg><style></template>` would eat the
// `</template>` again). Naming the ambiguity keeps both directions closed.
test('W26-N1 ATTACK: a raw-text tag in foreign content cannot silently swallow the engine', () => {
  const engine = '/chart/chart.js';
  const loader = `<script src="${engine}"></script>`;
  const foreignHazard = [PARSE_HAZARDS.rawTextForeignContent];
  const cases = [
    // The witness. A browser opens `title` as HTML escapable raw text inside the `desc`
    // integration point, reads `</svg><style>` as text, closes it at `</title>` and loads the
    // engine. The walk cannot follow it there, so it says so instead of reporting an empty graph.
    ['svg desc/title', `<svg><desc><title></svg><style></title>${loader}`, [], foreignHazard],
    // MathML reaches the same state through a text integration point.
    ['math mi/title', `<math><mi><title></math><style></title>${loader}`, [], foreignHazard],
    // Inside a template the divergence moves the `</template>` itself, so the hazard has to
    // travel out of the inert body with the region boundary it calls into question. Without
    // that plumbing this cell reports the forbidden pair: no srcs, nothing unresolved.
    ['template-nested', `<template><svg><desc><title></svg><style></title></template>${loader}`, [], foreignHazard],
    // Negative control: the same carrier with the `</svg>` removed. Nothing pops, so the walk
    // never returns to HTML content, the `<style>` never opens a raw-text body, and the engine
    // is still reported as a load — as the browser also loads it. The stray pop is the carrier.
    ['no stray pop', `<svg><desc><title><style></title>${loader}`, [engine], [
      PARSE_HAZARDS.rawTextForeignContent,
      PARSE_HAZARDS.scriptForeignContent,
    ].sort()],
  ];

  for (const [label, body, expectedSrcs, expectedReasons] of cases) {
    const facts = shellFacts(`<!doctype html>\n${body}\n`, 'chart v 1.4/chart/integration-point.html');
    assert.equal(
      facts.parseComplete && facts.scriptSrcs.length === 0,
      false,
      `${label}: an empty loader graph may never be reported as fully resolved`,
    );
    assert.deepEqual(facts.scriptSrcs, expectedSrcs, label);
    assert.deepEqual(facts.parseIncompleteReasons, expectedReasons, label);
    assert.equal(facts.parseComplete, false, label);
  }
});

test('W26-N1 four-state proof on the integration-point raw-text carrier', () => {
  const engine = '/chart/chart.js';
  const carrier = `<svg><desc><title></svg><style></title><script src="${engine}"></script>`;
  const factsOf = (body) => shellFacts(`<!doctype html>\n${body}\n`, 'chart v 1.4/chart/integration-point.html');

  const fixed = factsOf(carrier);
  assert.equal(fixed.parseComplete, false, 'fixed state fails closed on the carrier');
  assert.deepEqual(fixed.parseIncompleteReasons, [PARSE_HAZARDS.rawTextForeignContent]);

  // Broken state. Delete the one token that makes the two walks disagree — the raw-text start
  // tag inside foreign content — and the same shape is honest again: `</svg>` pops, the
  // unterminated `<style>` swallows the tail in this scanner exactly as it does in a browser,
  // and nothing is dropped. So the hazard above is raised by the modelled divergence and not by
  // the fixture merely containing an svg and a style.
  const broken = factsOf(carrier.replace('<title>', ''));
  assert.deepEqual(broken.scriptSrcs, [], 'broken state: the browser loses this script too');
  assert.deepEqual(broken.parseIncompleteReasons, []);
  assert.equal(broken.parseComplete, true, 'broken state carries no hazard, so the cell is load-bearing');

  // Corrupted state, on the variant where the engine is visible: an undecodable src is not
  // credited as a load and adds its own named reason rather than being quietly dropped.
  const corrupted = factsOf(
    carrier.replace('</svg>', '').replace(`src="${engine}"`, 'src="&notarealreference;/chart/chart.js"'),
  );
  assert.deepEqual(corrupted.scriptSrcs, []);
  assert.deepEqual(corrupted.parseIncompleteReasons, [
    PARSE_HAZARDS.rawTextForeignContent,
    PARSE_HAZARDS.scriptForeignContent,
    PARSE_HAZARDS.scriptSrcUnreadable,
  ].sort());

  assert.throws(
    () => assert.equal(factsOf(carrier).parseComplete, true),
    /false !== true/,
    'inverted assertion flips',
  );
});

// The other half of the same plumbing. A template body is inert to every content scan, but the
// walk still has to find the `</template>` that bounds it, and it finds it by reading script
// bodies with the tokenizer's script-data states. A body that reaches the double-escaped run
// leaves the end of that element unresolvable — which at top level is already a named hazard —
// so it leaves the `</template>` behind it unresolvable too. Trusting it only because the
// ambiguity happens to sit inside a template is the same mistake in a different place.
test('W26-N1: an unresolvable script body inside a template travels out with the boundary', () => {
  const facts = shellFacts([
    '<!doctype html>',
    '<template><script>var s = "<!-- <script>";</script></template>',
    '<script src="/chart/chart.js"></script>',
  ].join('\n'), 'chart v 1.4/chart/template-double-escape.html');
  assert.deepEqual(facts.scriptSrcs, []);
  assert.deepEqual(facts.parseIncompleteReasons, [PARSE_HAZARDS.scriptDataDoubleEscape]);
  assert.equal(facts.parseComplete, false);

  // Control: without the double escape the same shape resolves, so the reason above is carried
  // by the ambiguous script body and not by a template containing a script at all.
  const resolved = shellFacts([
    '<!doctype html>',
    '<template><script>var s = "ordinary";</script></template>',
    '<script src="/chart/chart.js"></script>',
  ].join('\n'), 'chart v 1.4/chart/template-double-escape.html');
  assert.deepEqual(resolved.scriptSrcs, ['/chart/chart.js']);
  assert.deepEqual(resolved.parseIncompleteReasons, []);
  assert.equal(resolved.parseComplete, true);
});

// W27. The sibling the W26-N1 carriers left behind, and it needed no integration point at all —
// only the two `template` branches inside `templateContentEnd` disagreeing about foreign content.
// The end-tag branch honoured `</template>` from anywhere; the start-tag branch counted depth only
// in HTML content. So in `<template><svg><template></template>...` the walk spent the first
// `</template>` on the body it was bounding. A browser spends it on the SVG `template` element
// instead — `template` is not on the foreign-content breakout list, and the foreign end-tag walk
// pops the innermost entry carrying the token's name — and closes the HTML template on the second
// one, which puts the engine script that follows at top level where it loads. One token later the
// walk was in HTML content with an unterminated `<style>` in front of it, and the engine binding
// disappeared into a raw-text body no browser opened: empty loader graph at parseComplete=true.
//
// The carrier is interchangeable, because the walk's error is the boundary and not the tag that
// follows it: any unterminated raw-text element does the swallowing, and `math` opens foreign
// content just as `svg` does.
test('W27 ATTACK: a template in foreign content cannot move the boundary that hides the engine', () => {
  const engine = '<script src="/chart/chart.js"></script>';
  const cases = [
    ['svg carrier, style', `<template><svg><template></template><style></template>${engine}`],
    ['math carrier, style', `<template><math><template></template><style></template>${engine}`],
    ['nested svg carrier, style', `<template><svg><svg><template></template><style></template>${engine}`],
    ['svg carrier, title', `<template><svg><template></template><title></template>${engine}`],
  ];

  for (const [label, body] of cases) {
    const facts = shellFacts(`<!doctype html>\n${body}\n`, 'chart v 1.4/chart/template-in-foreign.html');
    assert.equal(
      facts.parseComplete && facts.scriptSrcs.length === 0,
      false,
      `${label}: an empty loader graph may never be reported as fully resolved`,
    );
    assert.deepEqual(facts.parseIncompleteReasons, [PARSE_HAZARDS.templateForeignContent], label);
    assert.equal(facts.parseComplete, false, label);
  }
});

// The negative control for the hazard's independence. Nothing in this document is raw text, so
// `raw-text-in-foreign-content` cannot be doing the work, and the divergence runs the other way:
// a browser keeps the HTML template open to the final `</template>` and loads nothing, while the
// walk releases the body early and credits the engine as a load. Over-reporting a load fails a
// module contract the shell does not break, so it is named too rather than reported as resolved.
test('W27: the hazard is reachable with no raw-text element in the document', () => {
  const facts = shellFacts([
    '<!doctype html>',
    '<template><svg><template></template><script src="/chart/chart.js"></script></template>',
  ].join('\n'), 'chart v 1.4/chart/template-in-foreign-no-raw-text.html');

  assert.deepEqual(facts.parseIncompleteReasons, [PARSE_HAZARDS.templateForeignContent]);
  assert.equal(
    facts.parseIncompleteReasons.includes(PARSE_HAZARDS.rawTextForeignContent),
    false,
    'the raw-text rule is not what closes this input',
  );
  assert.equal(facts.parseComplete, false);
});

// The `!empty` guard's boundary, in both content models. A self-closing `<svg><template/>` is
// acknowledged and popped where it stands, so the `</template>` after it really does close the
// body and ignoring the tag is not a guess — the W25 control depends on that staying green. In
// HTML content the slash is ignored, so a self-closing `<template/>` still opens a body, and the
// script parked behind it is inert exactly as a browser leaves it.
test('W27: a self-closing inner template stays green in both content models', () => {
  const engine = '/chart/chart.js';
  const loader = `<script src="${engine}"></script>`;
  const cases = [
    ['foreign self-closing', `<template><svg><template/></template>${loader}`, [engine]],
    ['foreign self-closing, spaced', `<template><svg><template /></template>${loader}`, [engine]],
    ['html inner template', `<template><template></template></template>${loader}`, [engine]],
    // The slash is ignored, so the inner template opens a body and the engine behind the single
    // `</template>` is still inside the outer one: inert in this walk and in a browser alike.
    ['html self-closing inner', `<template><template/>${loader}</template>`, []],
  ];

  for (const [label, body, expectedSrcs] of cases) {
    const facts = shellFacts(`<!doctype html>\n${body}\n`, 'chart v 1.4/chart/self-closing-inner-template.html');
    assert.deepEqual(facts.scriptSrcs, expectedSrcs, label);
    assert.deepEqual(facts.parseIncompleteReasons, [], label);
    assert.equal(facts.parseComplete, true, label);
  }
});

test('W27 four-state proof on the template-in-foreign-content carrier', () => {
  const engine = '/chart/chart.js';
  const carrier = `<template><svg><template></template><style></template><script src="${engine}"></script>`;
  const factsOf = (body) => shellFacts(`<!doctype html>\n${body}\n`, 'chart v 1.4/chart/template-in-foreign.html');

  const fixed = factsOf(carrier);
  assert.equal(fixed.parseComplete, false, 'fixed state fails closed on the carrier');
  assert.deepEqual(fixed.parseIncompleteReasons, [PARSE_HAZARDS.templateForeignContent]);

  // Broken state. Delete the one token the two walks disagree about — the `<template>` start tag
  // inside foreign content — and the same shape is honest again: the `</template>` closes the body
  // in both readings, the unterminated `<style>` swallows the tail in this scanner exactly as it
  // does in a browser, and nothing is dropped. So the hazard above is raised by the modelled
  // divergence and not by the fixture merely containing a template, an svg and a style.
  const broken = factsOf(carrier.replace('<svg><template>', '<svg>'));
  assert.deepEqual(broken.scriptSrcs, [], 'broken state: the browser loses this script too');
  assert.deepEqual(broken.parseIncompleteReasons, []);
  assert.equal(broken.parseComplete, true, 'broken state carries no hazard, so the cell is load-bearing');

  // Corrupted state, on the variant where the engine is visible: an undecodable src is not
  // credited as a load and adds its own named reason instead of being quietly dropped.
  const corrupted = factsOf(
    `<template><svg><template></template><script src="&notarealreference;${engine}"></script></template>`,
  );
  assert.deepEqual(corrupted.scriptSrcs, []);
  assert.deepEqual(corrupted.parseIncompleteReasons, [
    PARSE_HAZARDS.scriptSrcUnreadable,
    PARSE_HAZARDS.templateForeignContent,
  ].sort());
  assert.equal(corrupted.parseComplete, false);

  assert.throws(
    () => assert.equal(factsOf(carrier).parseComplete, true),
    /false !== true/,
    'inverted assertion flips',
  );
});

// Why the live inventory does not move under the stack rewrite: the two walks only diverge from
// the counter on markup that enters foreign content, and no shell in the pinned roots opens a
// script there. Pinned as a cell so the claim is checked rather than asserted in a handoff note,
// and so the first shell that does start using foreign markup arrives loudly.
test('W26: no live shell opens a script inside foreign content', () => {
  const discovered = discoverShells({ root, roots: ROOTS });
  const foreignShells = [];
  for (const shell of discovered.shells) {
    const html = fs.readFileSync(path.join(root, ...shell.path.split('/')), 'utf8');
    const walk = tokenizeShellDocument(html);
    if (walk.scripts.some((script) => script.foreign)
      || walk.hazards.includes(PARSE_HAZARDS.scriptForeignContent)) {
      foreignShells.push(shell.path);
    }
  }
  assert.deepEqual(foreignShells, []);
});

// The W26-N1 rule is deliberately blunt: it fires on every raw-text start tag inside foreign
// content, including the idiomatic `<svg><title>Icon</title>`, because whether the browser opened
// a text region depends on the element the tag is nested in and this walk models nothing below
// `svg`/`math`. Sharpening it means modelling the foreign element stack, which is the change that
// can lose a load; the blunt rule can only cost a RED. That trade is affordable exactly as long as
// no servable shell writes such markup, which is what this cell holds. If one starts to, the RED
// arrives here with a path attached instead of as an unexplained parse-incomplete budget overrun.
test('W26-N1: no live shell puts raw text inside foreign content', () => {
  const discovered = discoverShells({ root, roots: ROOTS });
  const rawTextShells = discovered.shells
    .filter((shell) => shell.parseIncompleteReasons.includes(PARSE_HAZARDS.rawTextForeignContent))
    .map((shell) => shell.path);
  assert.deepEqual(rawTextShells, []);
});

// W27 costs the live tree nothing, and this is where that claim is checked rather than asserted in
// a handoff note: the new hazard is reachable only from a `<template>` inside foreign content
// inside a template body, no servable shell writes that markup, and the parse-incomplete
// population is the same 13 shells as before the rule landed. A shell that starts writing it
// arrives here with a path attached rather than as an unexplained budget overrun.
test('W27: no live shell opens a template inside foreign content', () => {
  const discovered = discoverShells({ root, roots: ROOTS });
  const templateShells = discovered.shells
    .filter((shell) => shell.parseIncompleteReasons.includes(PARSE_HAZARDS.templateForeignContent))
    .map((shell) => shell.path);
  assert.deepEqual(templateShells, []);
  assert.equal(discovered.shells.filter((shell) => !shell.parseComplete).length, 13);
});

// The same inert ranges have to hold for the loader and hazard scans, not just for script
// elements. A retired loader call left behind in a comment is not a module this shell loads,
// and a `document.write` shown as example text is not an unreadable loader graph.
test('F6: loader calls and hazards inside comments and raw text are not live', () => {
  const html = [
    '<!doctype html>',
    "<!-- inject('/chart/modules/retired.js'); document.write('x'); importScripts('/chart/modules/old.js'); -->",
    "<textarea>var paths = ['/chart/modules/sample.js']; new Worker('/chart/modules/w.js');</textarea>",
    "<!-- var el = document.createElement('script'); -->",
    "<script>inject('/chart/modules/live.js');</script>",
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/commented-loader.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/modules/live.js']);
  assert.deepEqual(facts.parseIncompleteReasons, []);
  assert.equal(facts.parseComplete, true);
});

test('F6: loader calls and hazards inside templates are not live', () => {
  const html = [
    '<!doctype html>',
    '<template>',
    "  <script>inject('/chart/modules/template-loader.js');</script>",
    "  <script>document.write('x'); importScripts('/chart/modules/template-worker.js');</script>",
    '</template>',
    "<script>inject('/chart/modules/live.js');</script>",
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/template-loader.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/modules/live.js']);
  assert.deepEqual(facts.parseIncompleteReasons, []);
  assert.equal(facts.parseComplete, true);
});

test('F6: only script srcs that would fetch are credited as loads', () => {
  const html = [
    '<!doctype html>',
    '<script src="/chart/modules/classic.js"></script>',
    '<script type="" src="/chart/modules/empty-type.js"></script>',
    '<script type="text/javascript; charset=utf-8" src="/chart/modules/js-mime.js"></script>',
    '<script type="module" src="/chart/modules/module.mjs"></script>',
    '<script type="application/json" src="/chart/modules/not-fetched.js"></script>',
    '<script nomodule src="/chart/modules/legacy-only.js"></script>',
    '<script type="importmap" src="/chart/modules/import-map.json"></script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/script-types.html');
  assert.deepEqual(facts.scriptSrcs, [
    '/chart/modules/classic.js',
    '/chart/modules/empty-type.js',
    '/chart/modules/js-mime.js',
    '/chart/modules/module.mjs',
  ]);
  assert.deepEqual(facts.parseIncompleteReasons, [PARSE_HAZARDS.importMap]);
  assert.equal(facts.parseComplete, false);
});

test('R-W22 R1 ATTACK: nomodule suppresses classic scripts only, not module scripts', () => {
  const html = [
    '<!doctype html>',
    '<script nomodule src="/chart/modules/classic-legacy.js"></script>',
    '<script type="text/javascript" nomodule src="/chart/modules/js-mime-legacy.js"></script>',
    '<script type="module" nomodule src="/chart/chart.js"></script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/nomodule.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/chart.js']);
  assert.equal(facts.referencesChartJs, true);
  assert.equal(facts.parseComplete, true);
});

test('R-W22 R2 ATTACK: script and importmap types decode character references', () => {
  const html = [
    '<!doctype html>',
    '<script type="&#109;odule" src="/chart/chart.js"></script>',
    '<script type="&#105;mportmap">{"imports":{"chart":"/chart/chart.js"}}</script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/encoded-types.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/chart.js']);
  assert.equal(facts.referencesChartJs, true);
  assert.deepEqual(facts.parseIncompleteReasons, [PARSE_HAZARDS.importMap]);
  assert.equal(facts.parseComplete, false);
});

test('R-W22 R2 ATTACK: undecodable script types fail closed', () => {
  const facts = shellFacts(
    '<!doctype html>\n<script type="text&notarealreference;javascript" src="/chart/chart.js"></script>\n',
    'chart v 1.4/chart/undecodable-type.html',
  );

  assert.deepEqual(facts.scriptSrcs, []);
  assert.equal(facts.referencesChartJs, false);
  assert.deepEqual(facts.parseIncompleteReasons, [PARSE_HAZARDS.scriptTypeUnreadable]);
  assert.equal(facts.parseComplete, false);
});

test('F6: inline bodies of non-JS script types are inert to loader scans', () => {
  const html = [
    '<!doctype html>',
    '<script type="application/json">',
    '  {"loader":"inject(\'/chart/modules/json-only.js\')"}',
    '</script>',
    '<script type="text/plain">new Worker("/chart/modules/plain-worker.js");</script>',
    "<script>inject('/chart/modules/live.js');</script>",
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/non-js-inline.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/modules/live.js']);
  assert.deepEqual(facts.parseIncompleteReasons, []);
  assert.equal(facts.parseComplete, true);
});

test('R-W22 R3 ATTACK: foreign title and template content do not hide script srcs', () => {
  const html = [
    '<!doctype html>',
    '<svg><title><script src="/chart/chart.js"></script></title></svg>',
    '<svg><template><script src="/chart/modules/template-visible.js"></script></template></svg>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/foreign-carriers.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/chart.js', '/chart/modules/template-visible.js']);
  assert.equal(facts.referencesChartJs, true);
  // `<svg><title>` is where the W26-N1 rule costs something: the contents of an SVG `title` are
  // an HTML integration point, so this really is a content model the walk cannot settle, and
  // the shell is named unreadable even though the script inside it is still reported as a load.
  assert.deepEqual(facts.parseIncompleteReasons, [
    PARSE_HAZARDS.rawTextForeignContent,
    PARSE_HAZARDS.scriptForeignContent,
  ].sort());
  assert.equal(facts.parseComplete, false);
});

test('F6: scripts in svg or math and script href attributes fail closed', () => {
  const cases = [
    ['svg', '<svg><script href="/chart/modules/svg-loader.js"></script></svg>', [PARSE_HAZARDS.scriptHref, PARSE_HAZARDS.scriptForeignContent]],
    ['math', '<math><script></script></math>', [PARSE_HAZARDS.scriptForeignContent]],
    ['xlink', '<script xlink:href="/chart/modules/xlink-loader.js"></script>', [PARSE_HAZARDS.scriptHref]],
  ];
  for (const [label, body, expected] of cases) {
    const facts = shellFacts(`<!doctype html>\n${body}\n`, 'chart v 1.4/chart/foreign-script.html');
    assert.equal(facts.parseComplete, false, label);
    assert.deepEqual(facts.parseIncompleteReasons, expected, label);
  }
});

test('F6: a tag is read with its quoting, so a > inside an attribute cannot hide the src', () => {
  const html = [
    '<!doctype html>',
    '<script data-range="a>b" src="/chart/modules/after-gt.js"></script>',
    '<script src="/chart/modules/first.js" src="/chart/modules/second.js"></script>',
    '<script src="/chart/modules/spaced.js"></script >',
    '<script src="/chart/modules/self-closed.js"/>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/tags.html');
  assert.deepEqual(facts.scriptSrcs, [
    '/chart/modules/after-gt.js',
    // A duplicate attribute keeps the first value, the way the parser does.
    '/chart/modules/first.js',
    '/chart/modules/spaced.js',
    '/chart/modules/self-closed.js',
  ]);
  assert.equal(facts.parseComplete, true);
});

test('F6: abrupt and bang-terminated comments end where the parser ends them', () => {
  const cases = [
    ['abrupt close', '<!--><script src="/chart/modules/after.js"></script>'],
    ['abrupt close with dash', '<!---><script src="/chart/modules/after.js"></script>'],
    ['bang terminator', '<!-- swallow --!><script src="/chart/modules/after.js"></script>'],
  ];
  for (const [label, body] of cases) {
    const facts = shellFacts(`<!doctype html>\n${body}\n`, 'chart v 1.4/chart/comment-ends.html');
    assert.deepEqual(facts.scriptSrcs, ['/chart/modules/after.js'], label);
  }
});

// An unterminated comment really does swallow the rest of the document in a browser, so the
// scanner agrees with it rather than pretending the tail is live markup.
test('F6: an unterminated comment swallows the tail, as it does in a browser', () => {
  const facts = shellFacts(
    '<!doctype html>\n<!-- opened and never closed\n<script src="/chart/modules/never.js"></script>\n',
    'chart v 1.4/chart/unterminated.html',
  );
  assert.deepEqual(facts.scriptSrcs, []);
});

// The one place the tokenizer's script-data states change where an element ends: after a
// `<!--` inside script text, a nested `<script` opens a double-escaped run in which
// `</script>` no longer closes the element. The end of the element is genuinely ambiguous to
// anything short of a full parser, so the shell fails closed instead of being guessed at.
test('F6: script-data double escaping is a named hazard, not a guess', () => {
  const facts = shellFacts([
    '<!doctype html>',
    '<script>document.body.innerHTML = "<!-- <script></script> -->";</script>',
    '<script src="/chart/modules/after.js"></script>',
  ].join('\n'), 'chart v 1.4/chart/double-escape.html');

  assert.equal(facts.parseComplete, false);
  assert.deepEqual(facts.parseIncompleteReasons, [PARSE_HAZARDS.scriptDataDoubleEscape]);
  assert.deepEqual(facts.scriptSrcs, ['/chart/modules/after.js']);
});

test('F6: character references in a src are decoded, and an undecodable one fails closed', () => {
  const decoded = shellFacts(
    '<!doctype html>\n<script src="&#47;chart&sol;chart&period;js"></script>\n',
    'chart v 1.4/chart/encoded.html',
  );
  assert.deepEqual(decoded.scriptSrcs, ['/chart/chart.js']);
  assert.equal(decoded.referencesChartJs, true);
  assert.equal(decoded.parseComplete, true);

  const unreadable = shellFacts(
    '<!doctype html>\n<script src="&notarealreference;/chart/chart.js"></script>\n',
    'chart v 1.4/chart/encoded.html',
  );
  assert.deepEqual(unreadable.scriptSrcs, []);
  assert.deepEqual(unreadable.parseIncompleteReasons, [PARSE_HAZARDS.scriptSrcUnreadable]);
});

// Pins the hazard population of the real tree at the reason level. The preflight budget only
// counts shells, so a brand-new hazard class landing on an already-unreadable shell would
// otherwise arrive silently.
test('F6: the live tree carries exactly the known parse hazards', () => {
  const discovered = discoverShells({ root, roots: ROOTS });
  const reasons = {};
  for (const shell of discovered.shells) {
    for (const reason of shell.parseIncompleteReasons) reasons[reason] = (reasons[reason] || 0) + 1;
  }
  assert.deepEqual(reasons, {
    [PARSE_HAZARDS.documentWrite]: 5,
    [PARSE_HAZARDS.scriptElementCreation]: 4,
    [PARSE_HAZARDS.worker]: 4,
  });
  assert.equal(discovered.shells.filter((shell) => !shell.parseComplete).length, 13);
});

test('escapes and terminators keep the scan views index-aligned', () => {
  const html = [
    '<!doctype html>',
    '<script>',
    'var a = "\\\\";',
    "var b = '\\n\\t\\\\';",
    'var c = `a${1}b`;',
    'var d = "unterminated\\',
    '/* block */ // line',
    '</script>',
    '<script defer src="/chart/modules/after.js?v=20260727b80"></script>',
    '<!-- trailing comment -->',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/aligned.html');
  assert.deepEqual(facts.scriptSrcs, ['/chart/modules/after.js']);
  assert.equal(facts.parseComplete, true);
  assert.equal(facts.sizeBytes, Buffer.byteLength(html, 'utf8'));
});

test('parseIncompleteReasons are named, unique and sorted', () => {
  const html = [
    '<!doctype html>',
    '<script>',
    'var w = new Worker("/chart/modules/worker.js");',
    'var w2 = new Worker("/chart/modules/worker.js");',
    'document.write("anything");',
    'importScripts("/chart/modules/legacy.js");',
    '</script>',
  ].join('\n');

  const facts = shellFacts(html, 'chart v 1.4/chart/many-hazards.html');
  assert.deepEqual(facts.parseIncompleteReasons, [
    PARSE_HAZARDS.documentWrite,
    PARSE_HAZARDS.importScripts,
    PARSE_HAZARDS.worker,
  ].sort());
  assert.equal(facts.parseComplete, false);
});

test('chart engine references bind by basename in every relative form', () => {
  const bound = ['chart.js', './chart.js', '/chart/chart.js', '../../chart/chart.js', '/chart/chart.js?v=20260727b80', 'CHART.JS'];
  const unbound = ['/chart/chart-data-pipeline.js', '/chart/modules/chart.js.map', '/chart/chartjs.js', ''];
  for (const src of bound) assert.equal(referencesChartEngine(src), true, src);
  for (const src of unbound) assert.equal(referencesChartEngine(src), false, src);

  const facts = shellFacts(
    '<!doctype html>\n<script defer src="../chart.js?v=20260727b80"></script>\n',
    'chart v 1.4/chart/multichart-prod/chart-embed.html',
  );
  assert.equal(facts.referencesChartJs, true);
});

test('DEFAULT_ROOTS is the pinned servable universe and is frozen', () => {
  assert.equal(Object.isFrozen(DEFAULT_ROOTS), true);
  assert.deepEqual([...DEFAULT_ROOTS].sort(), [...ROOTS].sort());

  const liveInventoryRoots = JSON.parse(
    fs.readFileSync(path.join(root, 'scripts/servable-surface-inventory.json'), 'utf8'),
  ).roots;
  assert.deepEqual([...liveInventoryRoots].sort(), [...DEFAULT_ROOTS].sort());

  const defaulted = discoverShells({ root });
  assert.deepEqual(defaulted.roots, [...DEFAULT_ROOTS]);
});
