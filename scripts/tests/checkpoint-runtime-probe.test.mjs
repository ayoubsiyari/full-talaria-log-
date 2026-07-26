import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  diagnosticError,
  exactAssetPath,
  fetchArtifact,
  loadAuthCookies,
  parseArgs,
  probeSurface,
  safeUrl,
} from '../checkpoint-runtime-probe.mjs';
import { verifyRuntimeSnapshot } from '../lib/checkpoint-provenance.mjs';

const buildId = '20991231b99';

function fixtureBody(pathname, id = buildId) {
  const bodies = {
    '/chart/dist-v9/index.html': [
      `<script>window.__TALARIA_CHART_BUILD_ID='${id}'</script>`,
      `<script src="/chart/modules/drawing-tools-manager.js?v=${id}"></script>`,
      `<script src="/chart/chart.js?v=${id}"></script>`,
    ].join('\n'),
    '/chart/multichart-prod/harness/serve.mjs':
      `const buildId = '${id}';\nreturn '/chart/multichart-prod/chart-embed.html?' + params;\n`,
    '/chart/multichart-prod/chart-embed.html':
      `window.__TALARIA_CHART_BUILD_ID = p.get('v') || '${id}';\n`,
    '/chart/chart.js': `const CHART_ENGINE_BUILD = '${id}';\n`,
    '/chart/modules/drawing-tools-manager.js': 'export const ok = true;\n',
    '/chart/sw.js': `const SW_VERSION = "talaria-chart-${id}";\n`,
    '/chart/legacy-index.html': `<script src="/chart/chart.js?v=${id}"></script>\n`,
  };
  return bodies[pathname];
}

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('CLI remains backwards compatible and static by default', () => {
  assert.deepEqual(parseArgs([
    '--manifest=a.json',
    '--direct=http://direct',
    '--public=https://public',
  ]), {
    manifest: 'a.json',
    direct: 'http://direct',
    public: 'https://public',
  });
});

test('browser mode fails closed when authentication is missing', () => {
  assert.throws(
    () => loadAuthCookies({}, {}),
    /requires CHECKPOINT_BROWSER_COOKIES_JSON or --browser-auth-file/,
  );
});

test('secure environment cookie input is accepted without disclosure', () => {
  const secret = 'never-print-this';
  const cookies = loadAuthCookies({}, {
    CHECKPOINT_BROWSER_COOKIES_JSON: JSON.stringify([
      { name: 'session', value: secret, domain: 'example.invalid' },
    ]),
  });
  assert.equal(cookies[0].value, secret);
  assert.doesNotMatch(safeUrl(`https://x.invalid/?session=${secret}`), /never-print-this/);
});

test('secure auth file input is accepted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-auth-'));
  try {
    const file = path.join(root, 'cookies.json');
    fs.writeFileSync(file, '[{"name":"session","value":"x","domain":"example.invalid"}]');
    if (process.platform !== 'win32') fs.chmodSync(file, 0o600);
    assert.equal(loadAuthCookies({ 'browser-auth-file': file }, {})[0].name, 'session');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('login redirects fail closed with bounded diagnostics', async () => {
  await withServer((request, response) => {
    if (request.url.startsWith('/login')) return response.end('login');
    response.writeHead(302, { location: '/login?token=secret-value' });
    response.end();
  }, async (origin) => {
    await assert.rejects(
      fetchArtifact(origin, '/chart/dist-v9/index.html', 'n', {
        statusClasses: [], redirects: [], frameUrls: [],
      }),
      (error) => /redirected to login/.test(error.message)
        && !error.message.includes('secret-value'),
    );
  });
});

test('401 responses fail closed with status-class diagnostics', async () => {
  await withServer((_request, response) => {
    response.writeHead(401);
    response.end('no');
  }, async (origin) => {
    await assert.rejects(
      fetchArtifact(origin, '/chart/chart.js', 'n', {
        statusClasses: [], redirects: [], frameUrls: [],
      }),
      /authentication rejected with HTTP 401.*2xx|authentication rejected with HTTP 401.*4xx/,
    );
  });
});

test('authenticated static asset surface succeeds with exact configured paths', async () => {
  await withServer((request, response) => {
    const body = fixtureBody(new URL(request.url, 'http://fixture').pathname);
    response.writeHead(body === undefined ? 404 : 200);
    response.end(body || 'missing');
  }, async (origin) => {
    const surface = await probeSurface(null, origin, buildId, 'n');
    assert.equal(surface.shellBuildId, buildId);
    assert.equal(surface.engineBuildId, buildId);
    assert.deepEqual(surface.browserFrameBuildIds, [buildId]);
  });
});

test('static iframe verification rejects spoofed configured asset paths', () => {
  assert.throws(
    () => exactAssetPath(
      "return '/evil/chart-embed.html?' + params",
      /return\s+['"]([^'"]*chart-embed\.html\?[^'"]*)['"]\s*\+/,
      '/chart/multichart-prod/chart-embed.html',
      'configured iframe asset',
    ),
    /expected exact path/,
  );
});

test('mixed direct and public assets remain a hard failure', async () => {
  const surfaces = [];
  for (const id of [buildId, '20991231b98']) {
    await withServer((request, response) => {
      const body = fixtureBody(new URL(request.url, 'http://fixture').pathname, id);
      response.writeHead(body === undefined ? 404 : 200);
      response.end(body || 'missing');
    }, async (origin) => surfaces.push(await probeSurface(null, origin, buildId, id)));
  }
  const result = verifyRuntimeSnapshot(
    { direct: surfaces[0], public: surfaces[1] },
    { buildId, checkpoint: 'C', source: { sha: 'a'.repeat(40) } },
  );
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /public|hash mismatch/);
});

test('timeout diagnostics are bounded and redact URL secrets', () => {
  const error = diagnosticError('browser-runtime', {
    currentUrl: 'https://x.invalid/chart?token=top-secret',
    frameUrls: Array.from(
      { length: 30 },
      (_, index) => `https://x.invalid/frame/${index}?session=top-secret`,
    ),
    statusClasses: ['2xx', '4xx', '2xx'],
    redirects: Array.from(
      { length: 30 },
      (_, index) => `https://x.invalid/redirect/${index}?auth=top-secret`,
    ),
  }, 'Timed out after 120000 ms');
  assert.doesNotMatch(error.message, /top-secret/);
  const diagnostic = JSON.parse(error.message.split('diagnostics=')[1]);
  assert.equal(diagnostic.frameUrls.length, 12);
  assert.equal(diagnostic.redirects.length, 12);
  assert.deepEqual(diagnostic.statusClasses, ['2xx', '4xx']);
});
