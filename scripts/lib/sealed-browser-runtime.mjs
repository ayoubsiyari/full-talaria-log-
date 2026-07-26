import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function inside(child, parent) {
  const relative = path.relative(parent, child);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function resolveSealedBrowserRuntime({
  bundleRoot = moduleRoot,
  nodePath = process.env.NODE_PATH,
} = {}) {
  if (nodePath) throw new Error('NODE_PATH is prohibited for sealed browser runners');
  const root = fs.realpathSync(bundleRoot);
  const harnessRoot = path.join(root, 'chart v 1.4', 'chart', 'multichart-prod', 'harness');
  const packagePath = path.join(harnessRoot, 'package.json');
  const require = createRequire(packagePath);
  const puppeteerEntry = fs.realpathSync(require.resolve('puppeteer'));
  const nodeModulesRoot = fs.realpathSync(path.join(harnessRoot, 'node_modules'));
  if (!inside(nodeModulesRoot, root)) {
    throw new Error('sealed harness node_modules resolves outside bundle');
  }
  if (!inside(puppeteerEntry, nodeModulesRoot)) {
    throw new Error('Puppeteer resolved outside sealed harness node_modules');
  }
  const chromeExecutable = fs.realpathSync(path.join(root, 'browser', 'chrome-linux64', 'chrome'));
  if (!inside(chromeExecutable, path.join(root, 'browser'))) {
    throw new Error('Chrome resolved outside sealed bundle');
  }
  const pins = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'browser-runtime-pins.json'), 'utf8'));
  const puppeteerPackage = fs.realpathSync(require.resolve('puppeteer/package.json'));
  if (!inside(puppeteerPackage, nodeModulesRoot)) {
    throw new Error('Puppeteer package metadata resolved outside sealed harness node_modules');
  }
  const puppeteerVersion = JSON.parse(fs.readFileSync(puppeteerPackage, 'utf8')).version;
  if (puppeteerVersion !== pins.puppeteerVersion) {
    throw new Error('sealed Puppeteer version mismatch');
  }
  const chromeSha256 = crypto.createHash('sha256').update(fs.readFileSync(chromeExecutable)).digest('hex');
  if (chromeSha256 !== pins.chromeExecutableSha256) {
    throw new Error('sealed Chrome executable hash mismatch');
  }
  return {
    bundleRoot: root,
    puppeteerEntry,
    puppeteerPackage,
    puppeteerVersion,
    chromeExecutable,
    require,
    chromeSha256,
  };
}

export function loadSealedPuppeteer(options) {
  const runtime = resolveSealedBrowserRuntime(options);
  return { ...runtime, puppeteer: runtime.require('puppeteer') };
}

export async function launchSealedBrowser(options = {}) {
  const { puppeteer, chromeExecutable, ...runtime } = loadSealedPuppeteer(options);
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromeExecutable,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  return { browser, chromeExecutable, ...runtime };
}
