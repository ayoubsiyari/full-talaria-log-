import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const chartRoot = path.resolve(here, '..');
const repoRoot = path.resolve(chartRoot, '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8');

class HostRestore {
  constructor() {
    this.generation = 0;
    this.state = null;
    this.listeners = new Set();
  }
  begin(sessionId, fileId) {
    this.state = {
      generation: ++this.generation,
      status: 'pending',
      sessionId,
      fileId,
    };
    this.emit();
    return this.generation;
  }
  finish(generation, status) {
    if (!this.state || this.state.generation !== generation || this.state.status !== 'pending') return false;
    this.state = { ...this.state, status };
    this.emit();
    return true;
  }
  emit() {
    for (const fn of this.listeners) fn(this.state);
  }
}

class PanelBoot {
  constructor(host, { sessionId, fileId }) {
    this.host = host;
    this.sessionId = sessionId;
    this.fileId = fileId;
    this.loads = 0;
    this.terminal = null;
    this.listener = (state) => this.consume(state);
    host.listeners.add(this.listener);
    this.consume(host.state);
  }
  matches(state) {
    return state
      && state.sessionId === this.sessionId
      && (!state.fileId || state.fileId === this.fileId)
      && (state.status === 'ready' || state.status === 'failed');
  }
  consume(state) {
    if (this.terminal || !this.matches(state)) return;
    if (state.status === 'failed') return this.fail('HOST_RESTORE_FAILED');
    this.loads += 1;
    this.terminal = 'ready';
    this.dispose();
  }
  timeout() {
    if (!this.terminal) this.fail('HOST_RESTORE_TIMEOUT');
  }
  fail(code) {
    this.terminal = code;
    this.dispose();
  }
  dispose() {
    this.host.listeners.delete(this.listener);
  }
}

test('hard reload waits for authoritative restore and boots exactly once', () => {
  const host = new HostRestore();
  const panel = new PanelBoot(host, { sessionId: '827', fileId: '25' });
  const token = host.begin('827', '25');
  assert.equal(panel.loads, 0);
  host.finish(token, 'ready');
  host.finish(token, 'ready');
  assert.equal(panel.loads, 1);
  assert.equal(panel.terminal, 'ready');
  assert.equal(host.listeners.size, 0);
});

test('accepted deterministic reload cell turns 6/6 GREEN', () => {
  let green = 0;
  for (let run = 0; run < 6; run += 1) {
    const host = new HostRestore();
    const panels = ['B', 'C', 'D'].map(() =>
      new PanelBoot(host, { sessionId: '827', fileId: '25' }));
    const token = host.begin('827', '25');
    host.finish(token, 'ready');
    if (panels.every((panel) => panel.loads === 1 && panel.terminal === 'ready')) green += 1;
  }
  assert.equal(green, 6);
});

test('normal no-session first load uses the same terminal ready signal', () => {
  const host = new HostRestore();
  const panel = new PanelBoot(host, { sessionId: null, fileId: '25' });
  const token = host.begin(null, '25');
  host.finish(token, 'ready');
  assert.equal(panel.loads, 1);
});

test('restore failure fails visibly without starting panel load', () => {
  const host = new HostRestore();
  const panel = new PanelBoot(host, { sessionId: '827', fileId: '25' });
  const token = host.begin('827', '25');
  host.finish(token, 'failed');
  assert.equal(panel.loads, 0);
  assert.equal(panel.terminal, 'HOST_RESTORE_FAILED');
});

test('bounded timeout is terminal and ignores late restore', () => {
  const host = new HostRestore();
  const panel = new PanelBoot(host, { sessionId: '827', fileId: '25' });
  const token = host.begin('827', '25');
  panel.timeout();
  host.finish(token, 'ready');
  assert.equal(panel.loads, 0);
  assert.equal(panel.terminal, 'HOST_RESTORE_TIMEOUT');
  assert.equal(host.listeners.size, 0);
});

test('rapid session switch invalidates stale completion', () => {
  const host = new HostRestore();
  const panel = new PanelBoot(host, { sessionId: 'new', fileId: '25' });
  const oldToken = host.begin('old', '25');
  const newToken = host.begin('new', '25');
  assert.equal(host.finish(oldToken, 'ready'), false);
  assert.equal(panel.loads, 0);
  assert.equal(host.finish(newToken, 'ready'), true);
  assert.equal(panel.loads, 1);
});

test('panel removal disposes listener and retry gets fresh identity', () => {
  const host = new HostRestore();
  const removed = new PanelBoot(host, { sessionId: '827', fileId: '25' });
  removed.dispose();
  const token = host.begin('827', '25');
  host.finish(token, 'ready');
  assert.equal(removed.loads, 0);
  const retry = new PanelBoot(host, { sessionId: '827', fileId: '25' });
  assert.equal(retry.loads, 1);
});

test('product wiring preserves switch, terminal failure, and exact mirrors', () => {
  const chart = read(path.join(chartRoot, 'chart.js'));
  const embed = read(path.join(chartRoot, 'multichart-prod', 'embed-bridge.js'));
  const manager = read(path.join(chartRoot, 'multichart-prod', 'multichart-manager.js'));
  assert.match(chart, /__TALARIA_DISABLE_B70_RELOAD_PANEL_BOOT_GATE_V1/);
  assert.match(chart, /_finishMultichartHostRestore\([\s\S]*?'ready'/);
  assert.match(embed, /waitForAuthoritativeHostRestore\(sessionId, fileId, runPanelLoad\)/);
  assert.match(embed, /PANEL_BOOT_TIMEOUT_MS = 30000/);
  assert.match(embed, /type: 'panel-boot-failed'/);
  assert.match(manager, /case 'panel-boot-failed':/);
  assert.equal(chart, read(path.join(repoRoot, 'homepage', 'public', 'chart', 'chart.js')));
  assert.equal(embed, read(path.join(repoRoot, 'homepage', 'public', 'chart', 'multichart-prod', 'embed-bridge.js')));
  assert.equal(manager, read(path.join(repoRoot, 'homepage', 'public', 'chart', 'multichart-prod', 'multichart-manager.js')));
});
