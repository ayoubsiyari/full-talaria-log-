/**
 * A panel realm cannot be collected while the HOST window holds a listener
 * closure created inside it. `talariaMcHostDataCommit` was registered on
 * window.parent and never removed, which measured as all nine peer realms
 * surviving teardown across three cycles.
 *
 * These are source-level invariants: the release path must exist, must be
 * reachable from the panel's own teardown, and must stay behind a kill-switch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHART = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../chart v 1.4/chart/chart.js',
);
const source = fs.readFileSync(CHART, 'utf8');

test('the host-commit listener registered on the parent window is also removed', () => {
  assert.match(
    source,
    /parentWin\.addEventListener\('talariaMcHostDataCommit'/,
    'install site moved; update this test',
  );
  assert.match(
    source,
    /parentWin\.removeEventListener\('talariaMcHostDataCommit', handler\)/,
    'the host keeps a closure from the panel realm and nothing removes it',
  );
});

test('release is reachable from the panel own teardown, not only from the host', () => {
  // Anchor on the method definition; the constructor calls it earlier in the file.
  const at = source.search(/\n {4}_installFinerPanelSelfOwnerHostCommitListener\(\) \{/);
  assert.notEqual(at, -1, 'install method not found');
  const install = source.slice(at);
  const body = install.slice(0, install.indexOf('\n    }'));
  assert.match(body, /window\.addEventListener\('pagehide', release\)/);
  assert.match(body, /window\.addEventListener\('unload', release\)/);
});

test('the release is behind a kill-switch read per call', () => {
  assert.match(source, /__TALARIA_DISABLE_MC_RELEASE_HOST_COMMIT_LISTENER_V1/);
  const guard = source.slice(source.indexOf('_mcReleaseHostCommitListenerEnabled()'));
  const body = guard.slice(0, guard.indexOf('\n    }'));
  // Host-window flag too: ops flip one switch on the host, not one per panel.
  assert.match(body, /parentWin\.__TALARIA_DISABLE_MC_RELEASE_HOST_COMMIT_LISTENER_V1/);
  assert.match(
    source,
    /_releaseFinerPanelSelfOwnerHostCommitListener\(\)\s*\{\s*if \(!this\._mcReleaseHostCommitListenerEnabled\(\)\) return false;/,
  );
});

test('release clears the handler so a second call cannot double-remove', () => {
  // Anchor on the method definition, not the call site inside the installer.
  const at = source.search(/\n {4}_releaseFinerPanelSelfOwnerHostCommitListener\(\) \{/);
  assert.notEqual(at, -1, 'release method not found');
  const release = source.slice(at);
  const body = release.slice(0, release.indexOf('\n    }'));
  assert.match(body, /if \(!handler\) return false;/);
  assert.match(body, /this\._mcFinerPanelHostCommitHandler = null;/);
});
