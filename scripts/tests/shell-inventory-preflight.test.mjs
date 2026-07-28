import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  EXIT_ALLOWED_RED,
  EXIT_GREEN,
  EXIT_UNEXPECTED_RED,
  EXPECTED_ALLOW_KINDS,
  EXPECTED_ALLOW_PATHS,
  PINNED_ROOTS,
  TALARIA_SHELL_PRESENCE_PREFLIGHT_V2,
  VIOLATION_KINDS,
  classifyResult,
  countKinds,
  formatReport,
  parseAllowKinds,
  parseArgs,
  validateShellInventory,
} from '../shell-inventory-preflight.mjs';
import {
  DEFAULT_ROOTS,
  discoverShells,
  referencesChartEngine,
} from '../lib/servable-shell-discovery.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const FIXTURE_ROOTS = ['chart v 1.4'];

function posixPath(value) {
  return value.replace(/\\/g, '/');
}

function writeFile(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function scriptTag(src, cacheStamp = true) {
  return `<script defer src="${src}${cacheStamp ? '?v=20260727b80' : ''}"></script>`;
}

function html({
  stamp = '20260727b80',
  scripts = [
    '/chart/modules/a.js',
    '/chart/modules/b.js',
    '/chart/modules/indicator-performance.js',
    '/chart/modules/module-presence-runtime.js',
  ],
  parseComplete = true,
  cacheStamp = true,
} = {}) {
  return [
    '<!doctype html>',
    `<meta name="talaria-build" content="${stamp}">`,
    ...scripts.map((script) => scriptTag(script, cacheStamp)),
    parseComplete ? '' : '<!-- UNPARSEABLE -->',
  ].join('\n');
}

function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-shell-preflight-'));
}

function citedRouting() {
  return {
    fastapiAllowlist: { present: true, file: 'server.py', line: 1, quote: 'allowlist' },
    fastapiMount: { present: false, file: null, line: null, quote: null },
    dockerCopy: { present: false, file: null, line: null, quote: null },
    nginxRoot: { present: false, file: null, line: null, quote: null },
  };
}

function noRouting() {
  return {
    fastapiAllowlist: { present: false, file: null, line: null, quote: null },
    fastapiMount: { present: false, file: null, line: null, quote: null },
    dockerCopy: { present: false, file: null, line: null, quote: null },
    nginxRoot: { present: false, file: null, line: null, quote: null },
  };
}

function discoverFixture({ root, roots }) {
  const shells = [];
  const visit = (absolute) => {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const target = path.join(absolute, entry.name);
      if (entry.isDirectory()) {
        visit(target);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
      const text = fs.readFileSync(target, 'utf8');
      const relative = posixPath(path.relative(root, target));
      const scriptSrcs = [...text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)]
        .map((match) => match[1].split(/[?#]/)[0]);
      shells.push({
        path: relative,
        sizeBytes: Buffer.byteLength(text),
        stampTokens: [...new Set([...text.matchAll(/\d{8}b\d+/g)].map((match) => match[0]))].sort(),
        scriptSrcs,
        loaderDigest: 'fixture',
        scriptCount: scriptSrcs.length,
        referencesChartJs: scriptSrcs.some((src) => referencesChartEngine(src)),
        parseComplete: !text.includes('UNPARSEABLE'),
      });
    }
  };
  for (const relativeRoot of roots) {
    const absoluteRoot = path.join(root, relativeRoot);
    if (fs.existsSync(absoluteRoot)) visit(absoluteRoot);
  }
  return {
    signature: 'TALARIA_SERVABLE_SHELL_DISCOVERY_V1',
    roots,
    shells: shells.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function baseServableInventory(overrides = {}) {
  return {
    schema: 'talaria.servable-surface-inventory.v1',
    roots: ['chart v 1.4'],
    surfaces: [{
      path: 'chart v 1.4/chart/index.html',
      status: 'owned-stamped',
      servable: true,
      reason: '',
      routingEvidence: citedRouting(),
    }],
    ...overrides,
  };
}

function baseChartInventory(overrides = {}) {
  return {
    schema: 'talaria.chart-shell-inventory.v1',
    roles: {
      'v9-host-source': {
        description: 'host shell',
        stampSeries: ['20260727b80'],
        requiredModules: ['/chart/modules/a.js', '/chart/modules/b.js'],
        forbiddenModules: ['/chart/modules/host-only.js'],
      },
    },
    shells: [{
      path: 'chart v 1.4/chart/index.html',
      role: 'v9-host-source',
      status: 'owned-stamped',
      servable: true,
      reason: '',
      routingEvidence: citedRouting(),
    }],
    ...overrides,
  };
}

// Fixtures declare their own universe, so they pin to it explicitly. The live CLI takes the
// module default, and a cell below proves the module default is the real repository's roots.
function runFixture({
  servableInventory = baseServableInventory(),
  chartInventory = baseChartInventory(),
  files = { 'chart v 1.4/chart/index.html': html() },
  root = scratch(),
  pinnedRoots = FIXTURE_ROOTS,
  discovered = discoverFixture,
} = {}) {
  try {
    const fixtureFiles = {
      'server.py': 'allowlist\n',
      ...files,
    };
    for (const [relative, content] of Object.entries(fixtureFiles)) {
      writeFile(root, relative, content);
    }
    return {
      root,
      result: validateShellInventory({ servableInventory, chartInventory, root, discovered, pinnedRoots }),
    };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function validateFixture(options) {
  return validateShellInventory({ pinnedRoots: FIXTURE_ROOTS, discovered: discoverFixture, ...options });
}

function kinds(result) {
  return result.violations.map((entry) => entry.kind);
}

function assertRed(result, kind) {
  assert.equal(result.signature, TALARIA_SHELL_PRESENCE_PREFLIGHT_V2);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(kinds(result).includes(kind), `${kind} absent from ${JSON.stringify(result.violations)}`);
}

function assertGreen(result) {
  assert.equal(result.signature, TALARIA_SHELL_PRESENCE_PREFLIGHT_V2);
  assert.equal(result.ok, true, JSON.stringify(result.violations));
}

function routingForDerivedServable(derivedServable) {
  return derivedServable ? citedRouting() : noRouting();
}

function statusEvidenceInventories(status, derivedServable) {
  const reason = status === 'owned-stamped' || status === 'image-verified'
    ? ''
    : `fixture ${status}`;
  const shared = {
    status,
    servable: derivedServable,
    reason,
    routingEvidence: routingForDerivedServable(derivedServable),
  };
  const servableInventory = baseServableInventory({
    surfaces: [{
      ...baseServableInventory().surfaces[0],
      ...shared,
    }],
  });
  const chartInventory = baseChartInventory({
    shells: [{
      ...baseChartInventory().shells[0],
      ...shared,
      proofOfDeRouting: status === 'removal-pending' || status === 'denied-route-pending'
        ? [{ requirement: `settle ${status}`, file: 'server.py', line: 1, satisfied: true }]
        : undefined,
    }],
  });
  return { servableInventory, chartInventory };
}

test('failure mode 1: undeclared shell is RED', () => {
  const root = scratch();
  try {
    const { result } = runFixture({
      root,
      files: {
        'chart v 1.4/chart/index.html': html(),
        'chart v 1.4/chart/forgotten.html': html(),
      },
    });
    assertRed(result, 'undeclared-shell');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('surfaces field declares discovered shells in the servable inventory', () => {
  const root = scratch();
  try {
    const servableInventory = baseServableInventory({ shells: [] });
    const { result } = runFixture({ root, servableInventory });
    assertGreen(result);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failure mode 2: owned-stamped declaration missing from disk is RED', () => {
  const root = scratch();
  try {
    const { result } = runFixture({ root, files: {} });
    assertRed(result, 'declared-shell-missing');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failure mode 3: removal-pending always blocks the build', () => {
  const chartInventory = baseChartInventory({
    shells: [{
      path: 'chart v 1.4/chart/index.html',
      role: 'v9-host-source',
      status: 'removal-pending',
      servable: true,
      reason: 'must be deleted',
      routingEvidence: citedRouting(),
      proofOfDeRouting: [{ requirement: 'remove route', file: 'server.py', line: 1, satisfied: true }],
    }],
  });
  const root = scratch();
  try {
    const { result } = runFixture({ root, chartInventory });
    assertRed(result, 'removal-pending');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failure mode 4: removed shell still present is RED', () => {
  const chartInventory = baseChartInventory({
    shells: [{
      path: 'chart v 1.4/chart/index.html',
      role: 'v9-host-source',
      status: 'removed',
      servable: false,
      reason: 'already removed from policy',
      routingEvidence: noRouting(),
    }],
  });
  const root = scratch();
  try {
    const { result } = runFixture({ root, chartInventory });
    assertRed(result, 'removed-shell-present');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failure mode 5: stamp violations are RED', () => {
  const cases = [
    ['stamp-absent', html({ stamp: 'no-stamp', cacheStamp: false })],
    ['stamp-series-mismatch', html({ stamp: '20260727b81', cacheStamp: false })],
    ['stamp-mixed', html({ stamp: '20260727b80 20260727b81', cacheStamp: false })],
  ];
  for (const [kind, content] of cases) {
    const root = scratch();
    try {
      const { result } = runFixture({ root, files: { 'chart v 1.4/chart/index.html': content } });
      assertRed(result, kind);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('failure mode 6: required module absence, duplication and ordering are RED', () => {
  const cases = [
    ['required-module-count', html({ scripts: ['/chart/modules/b.js'] })],
    ['required-module-count', html({ scripts: ['/chart/modules/a.js', '/chart/modules/a.js', '/chart/modules/b.js'] })],
    ['required-module-order', html({ scripts: ['/chart/modules/b.js', '/chart/modules/a.js'] })],
  ];
  for (const [kind, content] of cases) {
    const root = scratch();
    try {
      const { result } = runFixture({ root, files: { 'chart v 1.4/chart/index.html': content } });
      assertRed(result, kind);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('failure mode 7: forbidden module present is RED', () => {
  const root = scratch();
  try {
    const { result } = runFixture({
      root,
      files: {
        'chart v 1.4/chart/index.html': html({ scripts: ['/chart/modules/a.js', '/chart/modules/b.js', '/chart/modules/host-only.js'] }),
      },
    });
    assertRed(result, 'forbidden-module-present');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failure mode 8: parseComplete false on servable shell is RED', () => {
  const root = scratch();
  try {
    const { result } = runFixture({ root, files: { 'chart v 1.4/chart/index.html': html({ parseComplete: false }) } });
    assertRed(result, 'shell-parse-incomplete');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failure mode 9: image-verified shells are explicitly skipped', () => {
  const chartInventory = baseChartInventory({
    shells: [{
      path: 'chart v 1.4/chart/index.html',
      role: 'v9-host-source',
      status: 'image-verified',
      servable: true,
      reason: 'verified in image layer',
      routingEvidence: citedRouting(),
    }],
  });
  const root = scratch();
  try {
    const { result } = runFixture({ root, chartInventory });
    assertGreen(result);
    assert.deepEqual(result.skipped, [{
      path: 'chart v 1.4/chart/index.html',
      role: 'v9-host-source',
      status: 'image-verified',
      reason: 'verified in image layer',
    }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failure mode 10: inventory schema and vocabulary violations are RED', () => {
  const cases = [
    ['inventory-schema', (chartInventory) => { chartInventory.schema = 'talaria.chart-shell-inventory.v2'; }],
    ['role-id-invalid', (chartInventory) => { chartInventory.roles.host = chartInventory.roles['v9-host-source']; delete chartInventory.roles['v9-host-source']; chartInventory.shells[0].role = 'host'; }],
    ['shell-undefined-role', (chartInventory) => { chartInventory.shells[0].role = 'missing'; }],
    ['shell-status-invalid', (chartInventory) => { chartInventory.shells[0].status = 'owned'; }],
    ['shell-reason-missing', (chartInventory) => { chartInventory.shells[0].status = 'no-routing-evidence'; chartInventory.shells[0].servable = false; chartInventory.shells[0].routingEvidence = noRouting(); }],
  ];
  for (const [kind, mutate] of cases) {
    const root = scratch();
    try {
      const chartInventory = structuredClone(baseChartInventory());
      mutate(chartInventory);
      const { result } = runFixture({ root, chartInventory });
      assertRed(result, kind);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('NC-SHELL-UNDECLARED: undeclared HTML flips RED to GREEN only when declared', () => {
  const root = scratch();
  try {
    const files = {
      'chart v 1.4/chart/index.html': html(),
      'chart v 1.4/chart/forgotten.html': html(),
    };
    const red = runFixture({ root, files }).result;
    assertRed(red, 'undeclared-shell');

    const declaredServable = baseServableInventory({
      surfaces: [
        ...baseServableInventory().surfaces,
        {
          path: 'chart v 1.4/chart/forgotten.html',
          status: 'owned-stamped',
          servable: true,
          reason: '',
          routingEvidence: citedRouting(),
        },
      ],
    });
    const declaredChart = baseChartInventory({
      shells: [
        ...baseChartInventory().shells,
        {
          path: 'chart v 1.4/chart/forgotten.html',
          role: 'v9-host-source',
          status: 'owned-stamped',
          servable: true,
          reason: '',
          routingEvidence: citedRouting(),
        },
      ],
    });
    const green = validateFixture({ servableInventory: declaredServable, chartInventory: declaredChart, root });
    assertGreen(green);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('surface inventory exclusion suppresses undeclared-shell for matched discoveries', () => {
  const root = scratch();
  try {
    const servableInventory = baseServableInventory({
      exclusions: [{
        pattern: '**/node_modules/**',
        reason: 'vendor fixture excluded from servable shell declarations',
        expectedMatchCount: 1,
        routingEvidence: noRouting(),
      }],
    });
    const { result } = runFixture({
      root,
      servableInventory,
      files: {
        'chart v 1.4/chart/index.html': html(),
        'chart v 1.4/chart/node_modules/vendor.html': html(),
      },
    });
    assertGreen(result);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('four-state anti-lying proof', () => {
  const root = scratch();
  try {
    writeFile(root, 'server.py', 'allowlist\n');
    writeFile(root, 'chart v 1.4/chart/index.html', html());
    const good = validateFixture({ servableInventory: baseServableInventory(), chartInventory: baseChartInventory(), root });
    assertGreen(good);

    const broken = validateFixture({
      servableInventory: baseServableInventory(),
      chartInventory: baseChartInventory(),
      root,
      discovered: () => ({
        ...discoverFixture({ root, roots: FIXTURE_ROOTS }),
        shells: [{ ...discoverFixture({ root, roots: FIXTURE_ROOTS }).shells[0], scriptSrcs: ['/chart/modules/a.js'] }],
      }),
    });
    assertRed(broken, 'required-module-count');

    const corrupted = validateFixture({
      servableInventory: baseServableInventory(),
      chartInventory: { ...baseChartInventory(), schema: 'corrupted' },
      root,
    });
    assertRed(corrupted, 'inventory-schema');

    assert.throws(
      () => assert.equal(good.ok, false),
      /true !== false/,
      'inverted assertion flips',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('relative script srcs resolve against the shell serving directory', () => {
  const root = scratch();
  try {
    const chartInventory = baseChartInventory({
      roles: {
        'multichart-embed-source': {
          description: 'embed shell',
          stampSeries: ['20260727b80'],
          requiredModules: ['/chart/chart.js', '/chart/modules/a.js', '/chart/modules/b.js'],
          forbiddenModules: [],
        },
      },
      shells: [{
        path: 'chart v 1.4/chart/multichart-prod/chart-embed.html',
        role: 'multichart-embed-source',
        status: 'owned-stamped',
        servable: true,
        reason: '',
        routingEvidence: citedRouting(),
      }],
    });
    const servableInventory = baseServableInventory({
      surfaces: [{
        path: 'chart v 1.4/chart/multichart-prod/chart-embed.html',
        status: 'owned-stamped',
        servable: true,
        reason: '',
        routingEvidence: citedRouting(),
      }],
    });
    const { result } = runFixture({
      root,
      servableInventory,
      chartInventory,
      files: {
        'chart v 1.4/chart/multichart-prod/chart-embed.html': html({
          scripts: [
            '../chart.js',
            '../modules/a.js',
            './../modules/b.js',
            '../modules/indicator-performance.js',
            '../modules/module-presence-runtime.js',
            'https://cdn.example.invalid/x.js',
            '//cdn.example.invalid/y.js',
          ],
        }),
      },
    });
    assertGreen(result);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unrouted legacy shell may omit correctness exposure modules', () => {
  const root = scratch();
  try {
    const chartInventory = baseChartInventory({
      roles: {
        'legacy-host-source': {
          description: 'legacy shell',
          stampSeries: ['20260727b80'],
          requiredModules: ['/chart/chart.js', '/chart/modules/order-service.js'],
          forbiddenModules: [],
        },
      },
      shells: [{
        path: 'chart v 1.4/chart/legacy-index.html',
        role: 'legacy-host-source',
        status: 'owned-stamped',
        servable: false,
        reason: '',
        routingEvidence: noRouting(),
      }],
    });
    const servableInventory = baseServableInventory({
      surfaces: [{
        path: 'chart v 1.4/chart/legacy-index.html',
        status: 'owned-stamped',
        servable: false,
        reason: '',
        routingEvidence: noRouting(),
      }],
    });
    const { result } = runFixture({
      root,
      servableInventory,
      chartInventory,
      files: {
        'chart v 1.4/chart/legacy-index.html': html({
          scripts: ['chart.js', 'modules/order-service.js'],
        }),
      },
    });
    assertGreen(result);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('conditional-exposure is RED when a routed shell omits correctness modules', () => {
  const root = scratch();
  try {
    const chartInventory = baseChartInventory({
      roles: {
        'legacy-host-source': {
          description: 'legacy shell',
          stampSeries: ['20260727b80'],
          requiredModules: ['/chart/chart.js', '/chart/modules/order-service.js'],
          forbiddenModules: [],
        },
      },
      shells: [{
        path: 'chart v 1.4/chart/legacy-index.html',
        role: 'legacy-host-source',
        status: 'owned-stamped',
        servable: true,
        reason: '',
        routingEvidence: citedRouting(),
      }],
    });
    const servableInventory = baseServableInventory({
      surfaces: [{
        path: 'chart v 1.4/chart/legacy-index.html',
        status: 'owned-stamped',
        servable: true,
        reason: '',
        routingEvidence: citedRouting(),
      }],
    });
    const { result } = runFixture({
      root,
      servableInventory,
      chartInventory,
      files: {
        'chart v 1.4/chart/legacy-index.html': html({
          scripts: ['chart.js', 'modules/order-service.js'],
        }),
      },
    });
    assertRed(result, 'conditional-exposure');
    assert.deepEqual(result.violations
      .find((entry) => entry.kind === 'conditional-exposure')
      .missingModules, [
      '/chart/modules/indicator-performance.js',
      '/chart/modules/module-presence-runtime.js',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('NC-EXPOSURE-REROUTE: missing correctness modules flips GREEN only after de-routing', () => {
  const root = scratch();
  try {
    const role = {
      'legacy-host-source': {
        description: 'legacy shell',
        stampSeries: ['20260727b80'],
        requiredModules: ['/chart/chart.js'],
        forbiddenModules: [],
      },
    };
    const routedChart = baseChartInventory({
      roles: role,
      shells: [{
        path: 'chart v 1.4/chart/legacy-index.html',
        role: 'legacy-host-source',
        status: 'owned-stamped',
        servable: true,
        reason: '',
        routingEvidence: citedRouting(),
      }],
    });
    const routedServable = baseServableInventory({
      surfaces: [{
        path: 'chart v 1.4/chart/legacy-index.html',
        status: 'owned-stamped',
        servable: true,
        reason: '',
        routingEvidence: citedRouting(),
      }],
    });
    const files = {
      'chart v 1.4/chart/legacy-index.html': html({ scripts: ['chart.js'] }),
    };
    const red = runFixture({ root, servableInventory: routedServable, chartInventory: routedChart, files }).result;
    assertRed(red, 'conditional-exposure');

    const deroutedChart = baseChartInventory({
      roles: role,
      shells: [{ ...routedChart.shells[0], servable: false, routingEvidence: noRouting() }],
    });
    const deroutedServable = baseServableInventory({
      surfaces: [{ ...routedServable.surfaces[0], servable: false, routingEvidence: noRouting() }],
    });
    const green = validateFixture({
      servableInventory: deroutedServable,
      chartInventory: deroutedChart,
      root,
    });
    assertGreen(green);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('stampSeries supports empty and non-empty arrays', () => {
  const emptyStampRole = baseChartInventory({
    roles: {
      'pointer-stub': {
        description: 'stamp-free pointer',
        stampSeries: [],
        requiredModules: ['/chart/modules/a.js', '/chart/modules/b.js'],
        forbiddenModules: [],
      },
    },
    shells: [{
      path: 'chart v 1.4/chart/index.html',
      role: 'pointer-stub',
      status: 'owned-stamped',
      servable: true,
      reason: '',
      routingEvidence: citedRouting(),
    }],
  });
  const noStampRoot = scratch();
  try {
    const { result } = runFixture({
      root: noStampRoot,
      chartInventory: emptyStampRole,
      files: { 'chart v 1.4/chart/index.html': html({ stamp: 'no-stamp', cacheStamp: false }) },
    });
    assertGreen(result);
  } finally {
    fs.rmSync(noStampRoot, { recursive: true, force: true });
  }

  const unexpectedStampRoot = scratch();
  try {
    const { result } = runFixture({ root: unexpectedStampRoot, chartInventory: emptyStampRole });
    assertRed(result, 'stamp-unexpected');
  } finally {
    fs.rmSync(unexpectedStampRoot, { recursive: true, force: true });
  }

  const alternateStampRoot = scratch();
  try {
    const chartInventory = baseChartInventory({
      roles: {
        'v9-host-source': {
          ...baseChartInventory().roles['v9-host-source'],
          stampSeries: ['20260727b80', '20260727b81'],
        },
      },
    });
    const { result } = runFixture({
      root: alternateStampRoot,
      chartInventory,
      files: { 'chart v 1.4/chart/index.html': html({ stamp: '20260727b81', cacheStamp: false }) },
    });
    assertGreen(result);
  } finally {
    fs.rmSync(alternateStampRoot, { recursive: true, force: true });
  }
});

test('owned-stamped contracts are enforced even when not servable', () => {
  const root = scratch();
  try {
    const chartInventory = baseChartInventory({
      shells: [{
        path: 'chart v 1.4/chart/index.html',
        role: 'v9-host-source',
        status: 'owned-stamped',
        servable: false,
        reason: '',
        routingEvidence: noRouting(),
      }],
    });
    const servableInventory = baseServableInventory({
      surfaces: [{
        path: 'chart v 1.4/chart/index.html',
        status: 'owned-stamped',
        servable: false,
        reason: '',
        routingEvidence: noRouting(),
      }],
    });
    const { result } = runFixture({
      root,
      servableInventory,
      chartInventory,
      files: { 'chart v 1.4/chart/index.html': html({ scripts: ['/chart/modules/a.js'] }) },
    });
    assertRed(result, 'required-module-count');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('servable must be derived from routing evidence in both directions', () => {
  const cases = [
    [true, noRouting()],
    [false, citedRouting()],
  ];
  for (const [servable, routingEvidence] of cases) {
    const root = scratch();
    try {
      const chartInventory = baseChartInventory({
        shells: [{ ...baseChartInventory().shells[0], servable, routingEvidence }],
      });
      const servableInventory = baseServableInventory({
        surfaces: [{ ...baseServableInventory().surfaces[0], servable, routingEvidence }],
      });
      const { result } = runFixture({ root, servableInventory, chartInventory });
      assertRed(result, 'servable-not-derived');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('status evidence mapping accepts agreeing constrained statuses', () => {
  const cases = [
    ['no-routing-evidence', false, { green: true }],
    ['removed', false, { green: false, files: {}, otherRed: 'discovery-empty' }],
    ['removal-pending', true, { green: false, otherRed: 'removal-pending' }],
    ['denied-route-pending', true, { green: true }],
    ['image-verified', true, { green: true }],
  ];
  for (const [status, derivedServable, options] of cases) {
    const root = scratch();
    try {
      const { servableInventory, chartInventory } = statusEvidenceInventories(status, derivedServable);
      const { result } = runFixture({
        root,
        servableInventory,
        chartInventory,
        files: options.files,
      });
      assert.equal(kinds(result).includes('status-evidence-divergence'), false, JSON.stringify(result.violations));
      assert.equal(kinds(result).includes('servable-not-derived'), false, JSON.stringify(result.violations));
      if (options.green) {
        assertGreen(result);
      } else {
        assertRed(result, options.otherRed);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('status evidence mapping rejects diverging constrained statuses', () => {
  const cases = [
    ['no-routing-evidence', true],
    ['removed', true, { files: {} }],
    ['removal-pending', false],
    ['denied-route-pending', false],
    ['image-verified', false, { files: {} }],
  ];
  for (const [status, derivedServable, options = {}] of cases) {
    const root = scratch();
    try {
      const { servableInventory, chartInventory } = statusEvidenceInventories(status, derivedServable);
      const { result } = runFixture({
        root,
        servableInventory,
        chartInventory,
        files: options.files,
      });
      assertRed(result, 'status-evidence-divergence');
      assert.equal(kinds(result).includes('servable-not-derived'), false, JSON.stringify(result.violations));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('routing evidence present=true requires a citation', () => {
  const root = scratch();
  try {
    const routingEvidence = {
      ...noRouting(),
      dockerCopy: { present: true, file: null, line: null, quote: null },
    };
    const chartInventory = baseChartInventory({
      shells: [{ ...baseChartInventory().shells[0], routingEvidence }],
    });
    const servableInventory = baseServableInventory({
      surfaces: [{ ...baseServableInventory().surfaces[0], routingEvidence }],
    });
    const { result } = runFixture({ root, servableInventory, chartInventory });
    assertRed(result, 'routing-evidence-uncited');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('retainFile=true is RED when the file is absent from disk', () => {
  const root = scratch();
  try {
    const chartInventory = baseChartInventory({
      shells: [{ ...baseChartInventory().shells[0], retainFile: true }],
    });
    const servableInventory = baseServableInventory({
      surfaces: [{ ...baseServableInventory().surfaces[0], retainFile: true }],
    });
    const { result } = runFixture({ root, servableInventory, chartInventory, files: {} });
    assertRed(result, 'retained-file-missing');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('retainFile=true uses retainPath when an archived file is retained', () => {
  const root = scratch();
  try {
    const retained = 'docs/plan3/index.retained.html';
    const sentinelPath = 'chart v 1.4/chart/sentinel.html';
    const sentinelSurface = {
      path: sentinelPath,
      status: 'owned-stamped',
      servable: true,
      reason: '',
      routingEvidence: citedRouting(),
    };
    const sentinelShell = {
      ...sentinelSurface,
      role: 'v9-host-source',
    };
    const chartInventory = baseChartInventory({
      shells: [
        {
          ...baseChartInventory().shells[0],
          status: 'removed',
          servable: false,
          reason: 'original shell removed after archival',
          routingEvidence: noRouting(),
          retainFile: true,
          retainPath: retained,
          retainReason: 'retained for plan3 evidence',
        },
        sentinelShell,
      ],
    });
    const servableInventory = baseServableInventory({
      surfaces: [
        {
          ...baseServableInventory().surfaces[0],
          status: 'removed',
          servable: false,
          reason: 'original shell removed after archival',
          routingEvidence: noRouting(),
          retainFile: true,
          retainPath: retained,
          retainReason: 'retained for plan3 evidence',
        },
        sentinelSurface,
      ],
    });
    const { result } = runFixture({
      root,
      servableInventory,
      chartInventory,
      files: {
        [retained]: html(),
        [sentinelPath]: html(),
      },
    });
    assertGreen(result);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// The second review's attack: a denylist of specific broad strings is not a structural bound.
// `**/*.html` is not in any denylist and blanks every undeclared shell in the repository.
test('F1 ATTACK: exclusions without a literal segment or that swallow a root are RED', () => {
  const attacks = [
    ['**/*.html', 'every HTML file under every root'],
    ['**/*', 'every path under every root'],
    ['**/**', 'every path, doubled wildcard'],
    ['*/**', 'every path below one level'],
    ['**/*.htm?', 'wildcard extension with a single-character glob'],
    ['**/*node_modules*/**', 'literal text fused into a wildcard segment'],
    ['chart v 1.4/**', 'a whole declared root'],
    ['chart v 1.4', 'a whole declared root, bare'],
    ['chart v 1.4/**/*', 'a whole declared root with trailing wildcards'],
    ['/chart v 1.4/chart/**', 'absolute path'],
    ['../outside/**', 'escapes the repository'],
  ];
  for (const [pattern, why] of attacks) {
    const root = scratch();
    try {
      const servableInventory = baseServableInventory({
        exclusions: [{ pattern, reason: `attack: ${why}`, routingEvidence: noRouting() }],
      });
      const { result } = runFixture({
        root,
        servableInventory,
        files: {
          'chart v 1.4/chart/index.html': html(),
          'chart v 1.4/chart/node_modules/vendor.html': html(),
        },
      });
      assertRed(result, 'exclusion-invalid');
      assert.equal(kinds(result).includes('undeclared-shell'), true, `${pattern} must not blank the undeclared shell`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('F1: an exclusion that matches every discovered shell under a root is RED', () => {
  const root = scratch();
  try {
    const servableInventory = baseServableInventory({
      exclusions: [{
        pattern: '**/node_modules/**',
        reason: 'the only shell in this fixture lives under node_modules, so the root would be emptied',
        routingEvidence: noRouting(),
      }],
      surfaces: [],
    });
    const { result } = runFixture({
      root,
      servableInventory,
      chartInventory: baseChartInventory({ shells: [] }),
      files: { 'chart v 1.4/chart/node_modules/vendor.html': html() },
    });
    assertRed(result, 'exclusion-invalid');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('F1: expectedMatchCount must equal the shells the pattern actually matches', () => {
  const cases = [
    [2, null],
    [1, 'exclusion-count-mismatch'],
    [3, 'exclusion-count-mismatch'],
    [0, 'exclusion-invalid'],
    ['2', 'exclusion-invalid'],
    [1.5, 'exclusion-invalid'],
  ];
  for (const [expectedMatchCount, expectedKind] of cases) {
    const root = scratch();
    try {
      const servableInventory = baseServableInventory({
        exclusions: [{
          pattern: '**/node_modules/**',
          reason: 'two vendor pages carried inside a dependency tree',
          expectedMatchCount,
          routingEvidence: noRouting(),
        }],
      });
      const { result } = runFixture({
        root,
        servableInventory,
        files: {
          'chart v 1.4/chart/index.html': html(),
          'chart v 1.4/chart/node_modules/one.html': html(),
          'chart v 1.4/chart/node_modules/nested/two.html': html(),
        },
      });
      if (expectedKind === null) {
        assertGreen(result);
      } else {
        assertRed(result, expectedKind);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('F1: the live exclusion set satisfies the structural bound', () => {
  const liveInventory = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/servable-surface-inventory.json'), 'utf8'));
  const exclusions = liveInventory.exclusions ?? [];
  assert.ok(exclusions.length > 0, 'live inventory declares no exclusions to bound');
  for (const entry of exclusions) {
    const segments = entry.pattern.split('/');
    assert.ok(
      segments.some((segment) => segment !== '' && !/[*?[\]{}]/.test(segment)),
      `live exclusion ${entry.pattern} has no literal segment`,
    );
    assert.equal(liveInventory.roots.includes(entry.pattern.replace(/(?:\/\*+)+$/, '')), false, entry.pattern);
  }
});

test('F1: invalid and dead exclusions are RED', () => {
  const cases = [
    ['**', 'bounded objects reject repository-wide glob'],
    ['**/*', 'bounded objects reject match-everything glob'],
    ['*', 'bounded objects reject root wildcard glob'],
    ['', 'bounded objects reject empty glob'],
  ];
  for (const [pattern, reason] of cases) {
    const root = scratch();
    try {
      const servableInventory = baseServableInventory({
        exclusions: [{ pattern, reason, routingEvidence: noRouting() }],
      });
      const { result } = runFixture({ root, servableInventory });
      assertRed(result, 'exclusion-invalid');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const missingReasonRoot = scratch();
  try {
    const servableInventory = baseServableInventory({
      exclusions: [{ pattern: '**/vendor/**', reason: '', routingEvidence: noRouting() }],
    });
    const { result } = runFixture({ root: missingReasonRoot, servableInventory });
    assertRed(result, 'exclusion-invalid');
  } finally {
    fs.rmSync(missingReasonRoot, { recursive: true, force: true });
  }

  const deadRoot = scratch();
  try {
    const servableInventory = baseServableInventory({
      exclusions: [{ pattern: '**/vendor-only/**', reason: 'bounded but absent fixture', routingEvidence: noRouting() }],
    });
    const { result } = runFixture({ root: deadRoot, servableInventory });
    assertRed(result, 'exclusion-dead');
  } finally {
    fs.rmSync(deadRoot, { recursive: true, force: true });
  }
});

test('F2: zero discovered shells under inventory roots is RED', () => {
  const root = scratch();
  try {
    const { result } = runFixture({ root, files: {} });
    assertRed(result, 'discovery-empty');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('F3: chart shell membership is narrow and mandatory', () => {
  const chartFlagRoot = scratch();
  try {
    const servableInventory = baseServableInventory({
      surfaces: [{ ...baseServableInventory().surfaces[0], chartShell: true }],
    });
    const chartInventory = baseChartInventory({ shells: [] });
    const { result } = runFixture({ root: chartFlagRoot, servableInventory, chartInventory });
    assertRed(result, 'chart-shell-undeclared');
  } finally {
    fs.rmSync(chartFlagRoot, { recursive: true, force: true });
  }

  const discoveredReferenceRoot = scratch();
  try {
    const chartInventory = baseChartInventory({ shells: [] });
    const { result } = runFixture({
      root: discoveredReferenceRoot,
      chartInventory,
      files: { 'chart v 1.4/chart/index.html': html({ scripts: ['/chart/chart.js', '/chart/modules/a.js', '/chart/modules/b.js'] }) },
    });
    assertRed(result, 'chart-shell-undeclared');
  } finally {
    fs.rmSync(discoveredReferenceRoot, { recursive: true, force: true });
  }
});

test('F4: routing evidence must be present and quote-match cited source', () => {
  const mismatchRoot = scratch();
  try {
    const routingEvidence = {
      ...noRouting(),
      fastapiAllowlist: { present: true, file: 'server.py', line: 1, quote: 'wrong line' },
    };
    const chartInventory = baseChartInventory({
      shells: [{ ...baseChartInventory().shells[0], routingEvidence }],
    });
    const servableInventory = baseServableInventory({
      surfaces: [{ ...baseServableInventory().surfaces[0], routingEvidence }],
    });
    const { result } = runFixture({ root: mismatchRoot, servableInventory, chartInventory });
    assertRed(result, 'routing-evidence-mismatch');
  } finally {
    fs.rmSync(mismatchRoot, { recursive: true, force: true });
  }

  const missingRoot = scratch();
  try {
    const chartInventory = baseChartInventory({
      shells: [{ ...baseChartInventory().shells[0], routingEvidence: undefined }],
    });
    const { result } = runFixture({ root: missingRoot, chartInventory });
    assertRed(result, 'routing-evidence-missing');
  } finally {
    fs.rmSync(missingRoot, { recursive: true, force: true });
  }
});

function stubRoleInventory(requiredModules) {
  return baseChartInventory({
    roles: {
      'pointer-stub': {
        description: 'a row claiming to be an inert pointer',
        stampSeries: ['20260727b80'],
        requiredModules,
        forbiddenModules: [],
      },
    },
    shells: [{
      ...baseChartInventory().shells[0],
      role: 'pointer-stub',
      servable: true,
      routingEvidence: citedRouting(),
    }],
  });
}

// The second review's attack: exposure was decided by the role name, so relabelling a routed
// host row as pointer-stub bought silence. Membership is now decided by the path — a shell
// that loads the chart engine is in the class no matter what the row calls itself.
test('F5 ATTACK: a routed shell relabelled pointer-stub is still exposure-bound via chart.js', () => {
  const root = scratch();
  try {
    const { result } = runFixture({
      root,
      chartInventory: stubRoleInventory(['/chart/chart.js', '/chart/modules/a.js']),
      files: { 'chart v 1.4/chart/index.html': html({ scripts: ['/chart/chart.js', '/chart/modules/a.js'] }) },
    });
    assertRed(result, 'conditional-exposure');
    assert.deepEqual(
      result.violations.find((entry) => entry.kind === 'conditional-exposure').missingModules,
      ['/chart/modules/indicator-performance.js', '/chart/modules/module-presence-runtime.js'],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('F5 ATTACK: a relative chart.js reference binds the exposure class too', () => {
  const root = scratch();
  try {
    const servableInventory = baseServableInventory({
      surfaces: [{
        path: 'chart v 1.4/chart/multichart-prod/embed.html',
        status: 'owned-stamped',
        servable: true,
        reason: '',
        routingEvidence: citedRouting(),
      }],
    });
    const chartInventory = baseChartInventory({
      roles: {
        'browser-harness': {
          description: 'a row claiming to be a harness',
          stampSeries: ['20260727b80'],
          requiredModules: [],
          forbiddenModules: [],
        },
      },
      shells: [{
        path: 'chart v 1.4/chart/multichart-prod/embed.html',
        role: 'browser-harness',
        status: 'owned-stamped',
        servable: true,
        reason: '',
        routingEvidence: citedRouting(),
      }],
    });
    const { result } = runFixture({
      root,
      servableInventory,
      chartInventory,
      files: { 'chart v 1.4/chart/multichart-prod/embed.html': html({ scripts: ['../chart.js'] }) },
    });
    assertRed(result, 'conditional-exposure');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// The only skip discovery can support: a stub that loads nothing at all.
test('F5: pointer-stub skips exposure only with zero script srcs and no chart engine', () => {
  const emptyRoot = scratch();
  try {
    const { result } = runFixture({
      root: emptyRoot,
      chartInventory: stubRoleInventory([]),
      files: { 'chart v 1.4/chart/index.html': html({ scripts: [] }) },
    });
    assert.equal(kinds(result).includes('conditional-exposure'), false, JSON.stringify(result.violations));
    assertGreen(result);
  } finally {
    fs.rmSync(emptyRoot, { recursive: true, force: true });
  }

  const loadingRoot = scratch();
  try {
    const { result } = runFixture({
      root: loadingRoot,
      chartInventory: stubRoleInventory(['/chart/modules/a.js', '/chart/modules/b.js']),
      files: { 'chart v 1.4/chart/index.html': html({ scripts: ['/chart/modules/a.js', '/chart/modules/b.js'] }) },
    });
    assertRed(result, 'conditional-exposure');
  } finally {
    fs.rmSync(loadingRoot, { recursive: true, force: true });
  }
});

test('F5: exposure still requires routing, so de-routing a stub-labelled shell flips it GREEN', () => {
  const root = scratch();
  try {
    const chartInventory = baseChartInventory({
      roles: stubRoleInventory([]).roles,
      shells: [{
        ...baseChartInventory().shells[0],
        role: 'pointer-stub',
        servable: false,
        routingEvidence: noRouting(),
      }],
    });
    const servableInventory = baseServableInventory({
      surfaces: [{ ...baseServableInventory().surfaces[0], servable: false, routingEvidence: noRouting() }],
    });
    const { result } = runFixture({
      root,
      servableInventory,
      chartInventory,
      files: { 'chart v 1.4/chart/index.html': html({ scripts: ['/chart/chart.js'] }) },
    });
    assert.equal(kinds(result).includes('conditional-exposure'), false, JSON.stringify(result.violations));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Suppressing exposure on an unreadable shell is not an escape: the same shell is RED for the
// stronger reason that its loader graph cannot be resolved at all.
test('F5: hiding behind parse-incomplete does not buy a GREEN', () => {
  const root = scratch();
  try {
    const { result } = runFixture({
      root,
      chartInventory: stubRoleInventory(['/chart/chart.js']),
      files: { 'chart v 1.4/chart/index.html': html({ scripts: ['/chart/chart.js'], parseComplete: false }) },
    });
    assertRed(result, 'shell-parse-incomplete');
    assertRed(result, 'conditional-exposure');
    assert.equal(result.ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A14.3 ATTACK: parse-incomplete routed engine-bound shell still emits conditional-exposure', () => {
  const root = scratch();
  try {
    const chartInventory = baseChartInventory({
      roles: {
        'legacy-host-source': {
          description: 'legacy shell',
          stampSeries: ['20260727b80'],
          requiredModules: [],
          forbiddenModules: [],
        },
      },
      shells: [{
        path: 'chart v 1.4/chart/legacy-index.html',
        role: 'legacy-host-source',
        status: 'removal-pending',
        servable: true,
        reason: 'pending de-route',
        routingEvidence: citedRouting(),
        proofOfDeRouting: [{ requirement: 'remove allowlist', file: 'server.py', line: 1, satisfied: false }],
      }],
    });
    const servableInventory = baseServableInventory({
      surfaces: [{
        path: 'chart v 1.4/chart/legacy-index.html',
        status: 'removal-pending',
        servable: true,
        reason: 'pending de-route',
        routingEvidence: citedRouting(),
      }],
    });
    const { result } = runFixture({
      root,
      servableInventory,
      chartInventory,
      files: {
        'chart v 1.4/chart/legacy-index.html': html({
          scripts: ['/chart/chart.js'],
          parseComplete: false,
        }),
      },
    });
    assertRed(result, 'shell-parse-incomplete');
    assertRed(result, 'conditional-exposure');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A14.3 CONTROL: parse-incomplete non-exposure shell does not emit conditional-exposure alone', () => {
  const root = scratch();
  try {
    const chartInventory = baseChartInventory({
      roles: {
        'browser-harness': {
          description: 'harness',
          stampSeries: ['20260727b80'],
          requiredModules: ['/chart/modules/a.js'],
          forbiddenModules: [],
        },
      },
      shells: [{
        path: 'chart v 1.4/chart/index.html',
        role: 'browser-harness',
        status: 'owned-stamped',
        servable: true,
        reason: '',
        routingEvidence: citedRouting(),
      }],
    });
    const { result } = runFixture({
      root,
      chartInventory,
      files: { 'chart v 1.4/chart/index.html': html({ scripts: ['/chart/modules/a.js'], parseComplete: false }) },
    });
    assertRed(result, 'shell-parse-incomplete');
    assert.equal(kinds(result).includes('conditional-exposure'), false, JSON.stringify(result.violations));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('F5: a non-chart harness shell is outside the exposure class', () => {
  const root = scratch();
  try {
    const chartInventory = baseChartInventory({
      roles: {
        'browser-harness': {
          description: 'harness that never loads the chart engine',
          stampSeries: ['20260727b80'],
          requiredModules: ['/chart/modules/a.js'],
          forbiddenModules: [],
        },
      },
      shells: [{
        ...baseChartInventory().shells[0],
        role: 'browser-harness',
        servable: true,
        routingEvidence: citedRouting(),
      }],
    });
    const { result } = runFixture({
      root,
      chartInventory,
      files: { 'chart v 1.4/chart/index.html': html({ scripts: ['/chart/modules/a.js'] }) },
    });
    assert.equal(kinds(result).includes('conditional-exposure'), false, JSON.stringify(result.violations));
    assertGreen(result);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('F7: retained files require safe paths and reasons', () => {
  const root = scratch();
  try {
    const chartInventory = baseChartInventory({
      shells: [{
        ...baseChartInventory().shells[0],
        retainFile: true,
        retainPath: '../outside.html',
        retainReason: '',
      }],
    });
    const servableInventory = baseServableInventory({
      surfaces: [{
        ...baseServableInventory().surfaces[0],
        retainFile: true,
        retainPath: '/absolute.html',
        retainReason: '',
      }],
    });
    const { result } = runFixture({ root, servableInventory, chartInventory });
    assertRed(result, 'retain-path-invalid');
    assertRed(result, 'retain-reason-missing');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('F8: parse-incomplete discovered shells are RED regardless of status', () => {
  const root = scratch();
  try {
    const chartInventory = baseChartInventory({
      shells: [{
        ...baseChartInventory().shells[0],
        status: 'image-verified',
        reason: 'image layer owns module contract',
      }],
    });
    const { result } = runFixture({
      root,
      chartInventory,
      files: { 'chart v 1.4/chart/index.html': html({ parseComplete: false }) },
    });
    assertRed(result, 'shell-parse-incomplete');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unsatisfied proofOfDeRouting keeps pending rows RED', () => {
  const root = scratch();
  try {
    const chartInventory = baseChartInventory({
      shells: [{
        path: 'chart v 1.4/chart/index.html',
        role: 'v9-host-source',
        status: 'denied-route-pending',
        servable: false,
        reason: 'route denial not proven',
        routingEvidence: noRouting(),
        proofOfDeRouting: [{ requirement: 'deny fastapi route', file: 'server.py', line: 7, satisfied: false }],
      }],
    });
    const { result } = runFixture({ root, chartInventory });
    assertRed(result, 'proof-of-derouting-unsatisfied');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('abolished excluded status is RED', () => {
  const root = scratch();
  try {
    const chartInventory = baseChartInventory({
      shells: [{ ...baseChartInventory().shells[0], status: 'excluded', reason: 'old status' }],
    });
    const { result } = runFixture({ root, chartInventory });
    assertRed(result, 'status-abolished');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// End-to-end against the real discovery library: the straddled HTML comment must not be able
// to hide a forbidden module from the module contract.
test('F6 ATTACK end-to-end: a straddled comment cannot hide a forbidden module', () => {
  const root = scratch();
  try {
    const shell = [
      '<!doctype html>',
      '<meta name="talaria-build" content="20260727b80">',
      '<script>var opener = "<!--";</script>',
      '<script defer src="/chart/modules/a.js?v=20260727b80"></script>',
      '<script defer src="/chart/modules/b.js?v=20260727b80"></script>',
      '<script defer src="/chart/modules/indicator-performance.js?v=20260727b80"></script>',
      '<script defer src="/chart/modules/module-presence-runtime.js?v=20260727b80"></script>',
      '<script defer src="/chart/modules/host-only.js?v=20260727b80"></script>',
      '<!-- the closing comment the attacker relies on -->',
    ].join('\n');
    const { result } = runFixture({
      root,
      files: { 'chart v 1.4/chart/index.html': shell },
      discovered: ({ root: discoveryRoot, roots }) => discoverShells({ root: discoveryRoot, roots }),
    });
    assertRed(result, 'forbidden-module-present');
    assert.equal(kinds(result).includes('required-module-count'), false, JSON.stringify(result.violations));
    assert.equal(kinds(result).includes('shell-parse-incomplete'), false, JSON.stringify(result.violations));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('roots are pinned, not author-chosen', () => {
  const unpinnedRoot = scratch();
  try {
    const { result } = runFixture({ root: unpinnedRoot, pinnedRoots: PINNED_ROOTS });
    assertRed(result, 'inventory-roots-unpinned');
  } finally {
    fs.rmSync(unpinnedRoot, { recursive: true, force: true });
  }

  const narrowedRoot = scratch();
  try {
    const servableInventory = baseServableInventory({ roots: ['chart v 1.4/chart/multichart'] });
    const { result } = runFixture({ root: narrowedRoot, servableInventory });
    assertRed(result, 'inventory-roots-unpinned');
  } finally {
    fs.rmSync(narrowedRoot, { recursive: true, force: true });
  }

  const divergentRoot = scratch();
  try {
    const { result } = runFixture({
      root: divergentRoot,
      discovered: ({ root }) => ({
        ...discoverFixture({ root, roots: FIXTURE_ROOTS }),
        roots: ['homepage/public'],
      }),
    });
    assertRed(result, 'discovery-roots-divergent');
  } finally {
    fs.rmSync(divergentRoot, { recursive: true, force: true });
  }
});

test('the pinned universe agrees with discovery and with the live inventory', () => {
  assert.equal(Object.isFrozen(PINNED_ROOTS), true);
  assert.deepEqual([...PINNED_ROOTS].sort(), [...DEFAULT_ROOTS].sort());

  const liveRoots = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'scripts/servable-surface-inventory.json'), 'utf8'),
  ).roots;
  assert.deepEqual([...liveRoots].sort(), [...PINNED_ROOTS].sort());
});

test('a routed row cannot declare every routing channel absent', () => {
  const root = scratch();
  try {
    for (const status of ['removal-pending', 'denied-route-pending', 'owned-stamped']) {
      const shared = {
        status,
        servable: true,
        reason: `fixture ${status}`,
        routingEvidence: noRouting(),
      };
      const servableInventory = baseServableInventory({
        surfaces: [{ ...baseServableInventory().surfaces[0], ...shared }],
      });
      const chartInventory = baseChartInventory({
        shells: [{ ...baseChartInventory().shells[0], ...shared }],
      });
      const result = validateFixture({ servableInventory, chartInventory, root });
      assertRed(result, 'servable-not-derived');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('F9: the violation kind vocabulary covers every kind the gate can emit', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts/shell-inventory-preflight.mjs'), 'utf8');
  const emitted = new Set(
    [...source.matchAll(/violation\('([a-z-]+)'/g)].map((match) => match[1]),
  );
  assert.ok(emitted.size > 0, 'no violation kinds found in the gate source');
  for (const kind of [...emitted].sort()) {
    assert.ok(VIOLATION_KINDS.includes(kind), `${kind} is emitted but absent from VIOLATION_KINDS`);
  }
  assert.deepEqual(VIOLATION_KINDS, [...VIOLATION_KINDS].sort());
  assert.equal(new Set(VIOLATION_KINDS).size, VIOLATION_KINDS.length);
  assert.equal(Object.isFrozen(VIOLATION_KINDS), true);
});

test('F9: allow-kinds parsing is bounded and rejects unknown or malformed entries', () => {
  const allowances = parseAllowKinds('removal-pending,shell-parse-incomplete:13,proof-of-derouting-unsatisfied:45');
  assert.equal(allowances.get('removal-pending'), Number.POSITIVE_INFINITY);
  assert.equal(allowances.get('shell-parse-incomplete'), 13);
  assert.equal(allowances.get('proof-of-derouting-unsatisfied'), 45);
  assert.equal(parseAllowKinds('').size, 0);
  assert.equal(parseAllowKinds(undefined).size, 0);

  assert.throws(() => parseAllowKinds('removal-pendign'), /unknown violation kind removal-pendign/);
  assert.throws(() => parseAllowKinds('undeclared-shell:many'), /must be a non-negative integer/);
  assert.throws(() => parseAllowKinds('undeclared-shell:1:2'), /malformed --allow-kinds entry/);
});

test('F9: exit codes separate expected loud RED from unexpected RED', () => {
  const result = (kindList) => ({
    signature: TALARIA_SHELL_PRESENCE_PREFLIGHT_V2,
    ok: kindList.length === 0,
    checked: [],
    skipped: [],
    violations: kindList.map((kind) => ({ kind, detail: 'fixture' })),
  });

  assert.equal(classifyResult(result([]), parseAllowKinds('removal-pending')).exitCode, EXIT_GREEN);
  assert.equal(
    classifyResult(result(['removal-pending', 'removal-pending']), parseAllowKinds('removal-pending')).exitCode,
    EXIT_ALLOWED_RED,
  );
  assert.equal(
    classifyResult(result(['removal-pending', 'undeclared-shell']), parseAllowKinds('removal-pending')).exitCode,
    EXIT_UNEXPECTED_RED,
  );
  assert.equal(classifyResult(result(['removal-pending']), parseAllowKinds('')).exitCode, EXIT_UNEXPECTED_RED);

  const overBudget = classifyResult(
    result(['shell-parse-incomplete', 'shell-parse-incomplete']),
    parseAllowKinds('shell-parse-incomplete:1'),
  );
  assert.equal(overBudget.exitCode, EXIT_UNEXPECTED_RED);
  assert.deepEqual(overBudget.unexpected, [{ kind: 'shell-parse-incomplete', count: 2, allowed: 1 }]);

  const withinBudget = classifyResult(
    result(['shell-parse-incomplete', 'shell-parse-incomplete']),
    parseAllowKinds('shell-parse-incomplete:2'),
  );
  assert.equal(withinBudget.exitCode, EXIT_ALLOWED_RED);
  assert.deepEqual(withinBudget.unexpected, []);
  const counted = countKinds(result(['b-kind', 'a-kind', 'b-kind']).violations);
  assert.deepEqual(counted, { 'a-kind': 1, 'b-kind': 2 });
  assert.deepEqual(Object.keys(counted), ['a-kind', 'b-kind'], 'kind counts must be name-ordered');
});

test('F9: the report names kind counts, budgets and the exit code', () => {
  const synthetic = {
    signature: TALARIA_SHELL_PRESENCE_PREFLIGHT_V2,
    ok: false,
    checked: [],
    skipped: [],
    violations: [
      { kind: 'removal-pending', path: 'chart v 1.4/chart/legacy-index.html', detail: 'deploy blocked' },
      { kind: 'undeclared-shell', path: 'chart v 1.4/chart/new.html', detail: 'absent from inventory' },
    ],
  };
  const verdict = classifyResult(synthetic, parseAllowKinds('removal-pending'));
  const report = formatReport(synthetic, verdict);
  assert.match(report, /kind removal-pending count=1 allowed<=any/);
  assert.match(report, /kind undeclared-shell count=1 not allowed/);
  assert.match(report, /UNEXPECTED undeclared-shell: 1 violation\(s\) against a budget of 0/);
  assert.match(report, /exit=1$/m);

  const allowedOnly = { ...synthetic, violations: [synthetic.violations[0]] };
  const allowedVerdict = classifyResult(allowedOnly, parseAllowKinds('removal-pending'));
  assert.match(formatReport(allowedOnly, allowedVerdict), /RED \(all kinds allowed by --allow-kinds\) exit=2/);
});

test('F9: the workflow wires the gate at the pinned budgets', () => {
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/shell-inventory-preflight.yml'), 'utf8');
  assert.match(workflow, /npm run test:shell-inventory/);
  assert.match(workflow, /scripts\/shell-inventory-preflight\.mjs/);

  const allowFlag = workflow.match(/--allow-kinds=([^\s\\"']+)/);
  assert.ok(allowFlag, 'workflow does not pass --allow-kinds');
  const allowances = parseAllowKinds(allowFlag[1]);
  assert.ok(allowances.size > 0, 'workflow allowance list is empty');
  for (const [kind, maxCount] of allowances) {
    assert.ok(VIOLATION_KINDS.includes(kind), kind);
    assert.ok(Number.isFinite(maxCount), `${kind} must carry a numeric budget so the loud RED can only shrink`);
  }
  // The gate's own cells must never be allowed to fail silently.
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

function workflowText() {
  return fs.readFileSync(path.join(repoRoot, '.github/workflows/shell-inventory-preflight.yml'), 'utf8');
}

// Comment lines are stripped so the count below is of flags the runner actually passes, not
// of the flag being discussed in prose above the job.
function allowKindsFlags(workflow) {
  const runnable = workflow.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
  return [...runnable.matchAll(/--allow-kinds[= ]([^\s\\"']+)/g)].map((match) => match[1]);
}

function budgetsFrom(token) {
  return Object.fromEntries(
    [...parseAllowKinds(token).entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function liveKindCounts() {
  const servableInventory = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/servable-surface-inventory.json'), 'utf8'));
  const chartInventory = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/chart-shell-inventory.json'), 'utf8'));
  const discovered = discoverShells({ root: repoRoot, roots: servableInventory.roots });
  const result = validateShellInventory({ servableInventory, chartInventory, root: repoRoot, discovered });
  return countKinds(result.violations);
}

// The three-way lock. The workflow is held against the checked-in map, and the map is held
// against what the tree emits, so no single edit can widen the allowance: raising the flag
// alone breaks the first cell, raising both breaks the second.
test('F9: the workflow carries exactly one allowance flag, at the checked-in budgets', () => {
  const flags = allowKindsFlags(workflowText());
  assert.equal(flags.length, 1, `the gate must be invoked with exactly one --allow-kinds, found ${flags.length}`);
  assert.deepEqual(budgetsFrom(flags[0]), { ...EXPECTED_ALLOW_KINDS });
  assert.equal(Object.isFrozen(EXPECTED_ALLOW_KINDS), true);
  for (const [kind, budget] of Object.entries(EXPECTED_ALLOW_KINDS)) {
    assert.ok(VIOLATION_KINDS.includes(kind), `${kind} is budgeted but is not a violation kind`);
    assert.ok(Number.isInteger(budget) && budget >= 0, `${kind} must carry an integer budget`);
  }
});

test('F9: the live tree emits exactly the budgeted kinds and counts', () => {
  const counts = liveKindCounts();
  assert.deepEqual(counts, { ...EXPECTED_ALLOW_KINDS });

  const verdict = classifyResult(
    { violations: Object.entries(counts).flatMap(([kind, count]) => Array.from({ length: count }, () => ({ kind }))) },
    parseAllowKinds(allowKindsFlags(workflowText())[0]),
  );
  assert.deepEqual(verdict.unexpected, []);
  assert.equal(verdict.exitCode, EXIT_ALLOWED_RED);
});

test('F9: path-pinned budgeted conditional-exposure REDs stay on known shells', () => {
  const servableInventory = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/servable-surface-inventory.json'), 'utf8'));
  const chartInventory = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/chart-shell-inventory.json'), 'utf8'));
  const discovered = discoverShells({ root: repoRoot, roots: servableInventory.roots });
  const result = validateShellInventory({ servableInventory, chartInventory, root: repoRoot, discovered });
  const paths = result.violations
    .filter((entry) => entry.kind === 'conditional-exposure')
    .map((entry) => entry.path)
    .sort();

  assert.equal(Object.isFrozen(EXPECTED_ALLOW_PATHS), true);
  assert.equal(Object.isFrozen(EXPECTED_ALLOW_PATHS['conditional-exposure']), true);
  assert.deepEqual(paths, [...EXPECTED_ALLOW_PATHS['conditional-exposure']].sort());
});

test('F9 four-state proof: a budget cannot be raised from the workflow alone', () => {
  const workflow = workflowText();
  const agrees = (text) => {
    const flags = allowKindsFlags(text);
    return flags.length === 1 && JSON.stringify(budgetsFrom(flags[0])) === JSON.stringify({ ...EXPECTED_ALLOW_KINDS });
  };
  const raised = workflow.replace('shell-parse-incomplete:13', 'shell-parse-incomplete:14');
  const unbudgeted = workflow.replace('shell-parse-incomplete:13', 'shell-parse-incomplete');
  const appended = workflow.replace(
    '--allow-kinds=conditional-exposure:4',
    '--allow-kinds=undeclared-shell:9 --allow-kinds=conditional-exposure:4',
  );

  assert.equal(agrees(workflow), true, 'fixed state agrees with the checked-in map');
  assert.notEqual(raised, workflow, 'the raised-budget mutation must actually change the workflow');
  assert.equal(agrees(raised), false, 'raising a budget in the workflow fails the cell');
  assert.equal(agrees(unbudgeted), false, 'dropping a budget to unlimited fails the cell');
  assert.notEqual(appended, workflow, 'the second-flag mutation must actually change the workflow');
  assert.equal(agrees(appended), false, 'a second allowance flag fails the cell');
  assert.throws(() => assert.equal(agrees(workflow), false), /true !== false/, 'inverted assertion flips');
});

// Belt to the cell's braces: even if a second flag reached the CLI, argv is not last-one-wins.
test('F9: a repeated allowance flag is rejected by the CLI', () => {
  assert.deepEqual(parseArgs(['--allow-kinds=removal-pending:2']), { allowKinds: 'removal-pending:2' });
  const repeats = [
    ['--allow-kinds=removal-pending:2', '--allow-kinds=undeclared-shell:9'],
    ['--allow-kinds', 'removal-pending:2', '--allow-kinds', 'undeclared-shell:9'],
    ['--allow-kinds=removal-pending:2', '--allowKinds=undeclared-shell:9'],
    ['--out=a.json', '--out=b.json'],
  ];
  for (const argv of repeats) {
    assert.throws(() => parseArgs(argv), /may only be given once/, argv.join(' '));
  }
});

test('F9: a kind may be budgeted only once', () => {
  assert.throws(
    () => parseAllowKinds('removal-pending:2,removal-pending:9'),
    /names removal-pending more than once/,
  );
  assert.throws(
    () => parseAllowKinds('removal-pending,removal-pending:2'),
    /names removal-pending more than once/,
  );
});

// An exclusion without a declared match count is a pattern that can widen silently. It is RED,
// but it must not be RED by dropping the exclusion: unmasking the shells it covers would turn
// undeclared-shell into a budgeted kind, and that is the kind that must never carry a budget.
test('F9: exclusions must declare expectedMatchCount without unmasking what they cover', () => {
  const exclusion = (extra) => baseServableInventory({
    exclusions: [{
      pattern: '**/node_modules/**',
      reason: 'one vendor page carried inside a dependency tree',
      routingEvidence: noRouting(),
      ...extra,
    }],
  });
  const files = {
    'chart v 1.4/chart/index.html': html(),
    'chart v 1.4/chart/node_modules/vendor.html': html(),
  };

  const undeclaredRoot = scratch();
  try {
    const { result } = runFixture({ root: undeclaredRoot, servableInventory: exclusion({}), files });
    assertRed(result, 'exclusion-count-undeclared');
    assert.equal(kinds(result).includes('undeclared-shell'), false, JSON.stringify(result.violations));
    assert.deepEqual(kinds(result), ['exclusion-count-undeclared'], JSON.stringify(result.violations));
  } finally {
    fs.rmSync(undeclaredRoot, { recursive: true, force: true });
  }

  const declaredRoot = scratch();
  try {
    const { result } = runFixture({
      root: declaredRoot,
      servableInventory: exclusion({ expectedMatchCount: 1 }),
      files,
    });
    assertGreen(result);
  } finally {
    fs.rmSync(declaredRoot, { recursive: true, force: true });
  }
});

// The inverse carrier, end to end through the real discovery library. The browser closes the
// comment at the first `-->` and loads the forbidden module; before the tokenizer walk the
// gate saw an empty loader graph with parseComplete true, and reported GREEN.
test('F6 ATTACK end-to-end: a comment-carried opener cannot hide a forbidden module', () => {
  const carrier = '<!-- <script>var x = " --><script src="/chart/modules/host-only.js"></script><!-- ";</script> -->';
  const shell = (tail) => [
    '<!doctype html>',
    '<meta name="talaria-build" content="20260727b80">',
    '<script defer src="/chart/modules/a.js?v=20260727b80"></script>',
    '<script defer src="/chart/modules/b.js?v=20260727b80"></script>',
    '<script defer src="/chart/modules/indicator-performance.js?v=20260727b80"></script>',
    '<script defer src="/chart/modules/module-presence-runtime.js?v=20260727b80"></script>',
    ...tail,
  ].join('\n');

  const attackRoot = scratch();
  try {
    const { result } = runFixture({
      root: attackRoot,
      files: { 'chart v 1.4/chart/index.html': shell([carrier]) },
      discovered: ({ root: discoveryRoot, roots }) => discoverShells({ root: discoveryRoot, roots }),
    });
    assertRed(result, 'forbidden-module-present');
    assert.equal(kinds(result).includes('required-module-count'), false, JSON.stringify(result.violations));
    assert.equal(kinds(result).includes('shell-parse-incomplete'), false, JSON.stringify(result.violations));
  } finally {
    fs.rmSync(attackRoot, { recursive: true, force: true });
  }

  const cleanRoot = scratch();
  try {
    const { result } = runFixture({
      root: cleanRoot,
      files: { 'chart v 1.4/chart/index.html': shell([]) },
      discovered: ({ root: discoveryRoot, roots }) => discoverShells({ root: discoveryRoot, roots }),
    });
    assertGreen(result);
  } finally {
    fs.rmSync(cleanRoot, { recursive: true, force: true });
  }
});

test('F6 ATTACK end-to-end: template-parked exposure modules do not satisfy a routed host', () => {
  const root = scratch();
  try {
    const shellPath = 'chart v 1.4/chart/template-parked.html';
    const servableInventory = baseServableInventory({
      surfaces: [{
        path: shellPath,
        status: 'owned-stamped',
        servable: true,
        reason: '',
        routingEvidence: citedRouting(),
      }],
    });
    const chartInventory = baseChartInventory({
      roles: {
        'legacy-host-source': {
          description: 'legacy shell',
          stampSeries: ['20260727b80'],
          requiredModules: ['/chart/chart.js'],
          forbiddenModules: [],
        },
      },
      shells: [{
        path: shellPath,
        role: 'legacy-host-source',
        status: 'owned-stamped',
        servable: true,
        reason: '',
        routingEvidence: citedRouting(),
      }],
    });
    const shell = [
      '<!doctype html>',
      '<meta name="talaria-build" content="20260727b80">',
      '<script defer src="/chart/chart.js?v=20260727b80"></script>',
      '<template>',
      '  <script defer src="/chart/modules/indicator-performance.js?v=20260727b80"></script>',
      '  <template><script defer src="/chart/modules/module-presence-runtime.js?v=20260727b80"></script></template>',
      '</template>',
    ].join('\n');

    const { result } = runFixture({
      root,
      servableInventory,
      chartInventory,
      files: { [shellPath]: shell },
      discovered: ({ root: discoveryRoot, roots }) => discoverShells({ root: discoveryRoot, roots }),
    });
    assertRed(result, 'conditional-exposure');
    assert.equal(kinds(result).includes('required-module-count'), false, JSON.stringify(result.violations));
    assert.equal(kinds(result).includes('shell-parse-incomplete'), false, JSON.stringify(result.violations));
    assert.deepEqual(
      result.violations.find((entry) => entry.kind === 'conditional-exposure').missingModules,
      ['/chart/modules/indicator-performance.js', '/chart/modules/module-presence-runtime.js'],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('determinism: three consecutive runs produce byte-identical payloads', () => {
  const root = scratch();
  try {
    writeFile(root, 'chart v 1.4/chart/index.html', html());
    const runs = [1, 2, 3].map(() => JSON.stringify(validateFixture({
      servableInventory: baseServableInventory(),
      chartInventory: baseChartInventory(),
      root,
    })));
    assert.equal(new Set(runs).size, 1);
    assert.equal(runs[0].includes(root), false, 'payload must not contain absolute temp paths');
    assert.equal(runs[0].includes('\\'), false, 'payload must be repo-relative posix data');
    assert.equal(runs[0].includes('Date'), false, 'payload must not contain wall-clock labels');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('package.json test:shell-inventory runs both self-test files', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const command = packageJson.scripts?.['test:shell-inventory'];
  assert.equal(typeof command, 'string');
  assert.match(command, /scripts\/tests\/shell-inventory-preflight\.test\.mjs/);
  assert.match(command, /scripts\/tests\/servable-shell-discovery\.test\.mjs/);
});

test('alternate root and clock keep the assertion payload unchanged', () => {
  const firstRoot = scratch();
  const secondRoot = scratch();
  const beforeNow = Date.now;
  try {
    writeFile(firstRoot, 'chart v 1.4/chart/index.html', html());
    writeFile(secondRoot, 'chart v 1.4/chart/index.html', html());
    const first = JSON.stringify(validateFixture({
      servableInventory: baseServableInventory(),
      chartInventory: baseChartInventory(),
      root: firstRoot,
    }));
    Date.now = () => 1;
    const second = JSON.stringify(validateFixture({
      servableInventory: baseServableInventory(),
      chartInventory: baseChartInventory(),
      root: secondRoot,
    }));
    assert.equal(second, first);
    assert.equal(second.includes(firstRoot), false);
    assert.equal(second.includes(secondRoot), false);
  } finally {
    Date.now = beforeNow;
    fs.rmSync(firstRoot, { recursive: true, force: true });
    fs.rmSync(secondRoot, { recursive: true, force: true });
  }
});
