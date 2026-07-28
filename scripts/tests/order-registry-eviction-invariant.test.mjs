import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const gate = path.join(root, 'scripts/order-registry-eviction-invariant.mjs');

function writeFixture(dir, sites, sourceIds = ['order-manager', 'drawing-tools-manager']) {
  const fixture = {
    meta: {
      id: 'hermetic-order-registry-eviction-sites',
      product: 'synthetic',
      sources: sourceIds.map((id) => ({ id, path: path.join(dir, `${id}.js`) })),
      registryExpression: 'this.orderLines',
      discriminatorProperty: 'isPending',
      singleRowDisposalCall: 'this._disposeOrderLineElements',
      gateKind: 'structural',
      gateKindReason: 'test fixture',
      enforcedProperty: 'removal set equals disposal set',
      invariant: 'test fixture',
      hazard: 'test fixture',
      siteKey: 'test fixture',
      wholesaleResetCount: 0,
      notEnforced: [
        'G2-G11 unchanged in tests',
      ],
    },
    sites,
  };
  const fixturePath = path.join(dir, 'fixture.json');
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
  return fixturePath;
}

function writeGreenSources(dir) {
  const orderManager = `class OrderManager {
  removePendingOrderLine(orderId) {
    const lineDatas = (this.orderLines || []).filter((l) => l.orderId === orderId && l.isPending);
    lineDatas.forEach((lineData) => {
      if (lineData.line) lineData.line.remove();
    });
    this.orderLines = (this.orderLines || []).filter((l) => !(l.orderId === orderId && l.isPending));
  }
}
`;
  const drawingToolsManager = `class DrawingToolsManager {
  deleteDrawing(orderId) {
    const orderManager = this.chart.orderManager;
    const linesToRemove = (orderManager.orderLines || []).filter((l) => l.orderId === orderId && l.isPending);
    linesToRemove.forEach((lineData) => {
      if (lineData.line) lineData.line.remove();
    });
    orderManager.orderLines = (orderManager.orderLines || []).filter((l) => !(l.orderId === orderId && l.isPending));
  }
}
`;
  fs.writeFileSync(path.join(dir, 'order-manager.js'), orderManager);
  fs.writeFileSync(path.join(dir, 'drawing-tools-manager.js'), drawingToolsManager);
}

function greenSites() {
  return [
    {
      ordinal: 0,
      source: 'order-manager',
      enclosingMethod: 'removePendingOrderLine',
      ordinalInMethod: 0,
      disposal: { kind: 'collected-set', arrayBinding: 'lineDatas' },
      note: 'this.orderLines assignment shape',
    },
    {
      ordinal: 1,
      source: 'drawing-tools-manager',
      enclosingMethod: 'deleteDrawing',
      ordinalInMethod: 0,
      disposal: { kind: 'collected-set', arrayBinding: 'linesToRemove' },
      note: 'orderManager.orderLines assignment shape',
    },
  ];
}

function runGate(args, options = {}) {
  return execFileSync(process.execPath, [gate, ...args], {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });
}

test('hermetic multi-file scan inventories this.orderLines and orderManager.orderLines', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orei-green-'));
  writeGreenSources(dir);
  const fixturePath = writeFixture(dir, greenSites());

  const output = runGate([
    `--fixture=${fixturePath}`,
    `--sources=${path.join(dir, 'order-manager.js')},${path.join(dir, 'drawing-tools-manager.js')}`,
  ]);

  assert.match(output, /Summary: 6 passed, 0 failed/);
  assert.match(output, /\[0\] order-manager:L7 this\.orderLines removePendingOrderLine#0/);
  assert.match(output, /\[1\] drawing-tools-manager:L8 orderManager\.orderLines deleteDrawing#0/);
});

test('the same hermetic CLI command is green three times', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orei-three-green-'));
  writeGreenSources(dir);
  const fixturePath = writeFixture(dir, greenSites());
  const args = [
    `--fixture=${fixturePath}`,
    `--sources=${path.join(dir, 'order-manager.js')},${path.join(dir, 'drawing-tools-manager.js')}`,
  ];

  for (let i = 0; i < 3; i += 1) {
    const output = runGate(args);
    assert.match(output, /Summary: 6 passed, 0 failed/, `run ${i + 1} should be green`);
  }
});

test('wrong variant corpus still rejects dead discriminator widening', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orei-wrong-'));
  const source = `class OrderManager {
  updateOrderLines(ch) {
    const lines = (this.orderLines || []).filter((ol) => (ol.chart || this.chart) === ch);
    lines.forEach((olEntry) => {
      const { orderId, isPending } = olEntry;
      if (isPending) {
        this._disposeOrderLineElements(olEntry);
        this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && (ol.isPending || true) && (ol.chart || this.chart) === ch));
        return;
      }
    });
  }
}
`;
  fs.writeFileSync(path.join(dir, 'order-manager.js'), source);
  const fixturePath = writeFixture(dir, [
    {
      ordinal: 0,
      source: 'order-manager',
      enclosingMethod: 'updateOrderLines',
      ordinalInMethod: 0,
      disposal: {
        kind: 'single-row',
        binding: 'olEntry',
        iterationBinding: 'lines',
        disposedRow: { orderId: 'target', pending: true, chart: 'ch' },
      },
      note: 'wrong variant must remain red',
    },
  ], ['order-manager']);

  const result = spawnSync(process.execPath, [gate, `--fixture=${fixturePath}`], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /B-OREI-01 .*: PASS/);
  assert.match(result.stdout, /B-OREI-05 .*: FAIL/);
  assert.match(result.stdout, /removed but NOT disposed/);
});

test('unknown fixture keys fail closed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orei-unknown-key-'));
  writeGreenSources(dir);
  const fixturePath = writeFixture(dir, greenSites());
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  fixture.sites[0].exemption = 'not allowed';
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));

  const result = spawnSync(process.execPath, [gate, `--fixture=${fixturePath}`], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /B-OREI-02 .*: FAIL/);
  assert.match(result.stdout, /unknown key 'exemption'/);
});
