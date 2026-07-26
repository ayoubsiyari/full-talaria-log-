import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveSealedBrowserRuntime } from '../lib/sealed-browser-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealed-browser-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const harness = path.join(dir, 'chart v 1.4/chart/multichart-prod/harness');
  const moduleDir = path.join(harness, 'node_modules/puppeteer');
  const browserDir = path.join(dir, 'browser/chrome-linux64');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.mkdirSync(browserDir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(harness, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(moduleDir, 'package.json'),
    '{"name":"puppeteer","version":"24.43.1","main":"index.cjs"}\n');
  fs.writeFileSync(path.join(moduleDir, 'index.cjs'), 'module.exports={launch(){}};\n');
  const chrome = path.join(browserDir, 'chrome');
  fs.writeFileSync(chrome, 'sealed chrome fixture\n');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(chrome)).digest('hex');
  fs.writeFileSync(path.join(dir, 'scripts/browser-runtime-pins.json'),
    `${JSON.stringify({ puppeteerVersion: '24.43.1', chromeExecutableSha256: hash })}\n`);
  return { dir, harness, moduleDir, chrome };
}

test('resolves Puppeteer and Chrome only inside bundle', (t) => {
  const value = fixture(t);
  const runtime = resolveSealedBrowserRuntime({ bundleRoot: value.dir, nodePath: '' });
  assert.match(runtime.puppeteerEntry, /node_modules[\\/]puppeteer[\\/]index\.cjs$/);
  assert.equal(runtime.chromeExecutable, fs.realpathSync(value.chrome));
});

test('rejects NODE_PATH even when closure is valid', (t) => {
  const value = fixture(t);
  assert.throws(() => resolveSealedBrowserRuntime({
    bundleRoot: value.dir, nodePath: '/tmp/unsealed',
  }), /NODE_PATH is prohibited/);
});

test('rejects Puppeteer symlink escaping bundle', (t) => {
  const value = fixture(t);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'external-puppeteer-'));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  fs.cpSync(value.moduleDir, external, { recursive: true });
  fs.rmSync(value.moduleDir, { recursive: true });
  fs.symlinkSync(external, value.moduleDir, 'junction');
  assert.throws(() => resolveSealedBrowserRuntime({
    bundleRoot: value.dir, nodePath: '',
  }), /outside bundle|outside sealed harness/);
});

test('rejects Chrome symlink escaping bundle', (t) => {
  const value = fixture(t);
  const external = path.join(os.tmpdir(), `external-chrome-${process.pid}`);
  fs.writeFileSync(external, fs.readFileSync(value.chrome));
  t.after(() => fs.rmSync(external, { force: true }));
  fs.rmSync(value.chrome);
  try {
    fs.symlinkSync(external, value.chrome);
  } catch (error) {
    if (error?.code === 'EPERM') {
      t.skip('file symlinks require Windows Developer Mode');
      return;
    }
    throw error;
  }
  assert.throws(() => resolveSealedBrowserRuntime({
    bundleRoot: value.dir, nodePath: '',
  }), /outside sealed bundle/);
});

test('rejects changed Chrome executable bytes', (t) => {
  const value = fixture(t);
  fs.appendFileSync(value.chrome, 'tamper\n');
  assert.throws(() => resolveSealedBrowserRuntime({
    bundleRoot: value.dir, nodePath: '',
  }), /hash mismatch/);
});

test('rejects mismatched Puppeteer package version', (t) => {
  const value = fixture(t);
  fs.writeFileSync(path.join(value.moduleDir, 'package.json'),
    '{"name":"puppeteer","version":"0.0.0","main":"index.cjs"}\n');
  assert.throws(() => resolveSealedBrowserRuntime({
    bundleRoot: value.dir, nodePath: '',
  }), /Puppeteer version mismatch/);
});

test('bundled MC and short-cell runners use sealed loader', () => {
  const mc = fs.readFileSync(path.join(root,
    'tests/evidence/b70-stage5/mc-restore-authenticated-ab-runner.mjs'), 'utf8');
  const short = fs.readFileSync(path.join(root,
    'chart v 1.4/chart/multichart-prod/harness/m23-3-indicator-ledger-short-cell.mjs'), 'utf8');
  assert.match(mc, /launchSealedBrowser/);
  assert.match(mc, /--browser-smoke/);
  assert.match(short, /launchSealedBrowser/);
  assert.doesNotMatch(`${mc}\n${short}`, /NODE_PATH|from 'puppeteer'|require\('puppeteer'\)/);
});

test('runtime pins exact module and Chrome bundle paths', () => {
  const pins = JSON.parse(fs.readFileSync(path.join(root,
    'scripts/browser-runtime-pins.json'), 'utf8'));
  assert.equal(pins.nodeModulesPath,
    'chart v 1.4/chart/multichart-prod/harness/node_modules');
  assert.equal(pins.chromePath, 'browser/chrome-linux64/chrome');
  assert.match(pins.chromeExecutableSha256, /^[a-f0-9]{64}$/);
});
