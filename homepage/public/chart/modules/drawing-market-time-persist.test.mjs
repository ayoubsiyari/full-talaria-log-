/**
 * Drawing refresh oracle: persisted anchors are market time, not bar index.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

global.window = {};
global.document = { addEventListener() {}, removeEventListener() {} };

const DrawingToolsManager = require('./drawing-tools-manager.js');

test('drawing storage refreshes timestamp anchors before serialization', () => {
  const dm = Object.create(DrawingToolsManager.prototype);
  dm.chart = {
    currentTimeframe: '1m',
    data: [
      { t: 1700000000000 },
      { t: 1700000060000 },
      { t: 1700000120000 },
      { t: 1700000180000 },
      { t: 1700000240000 },
    ],
  };

  const drawing = {
    id: 'dr-market-time',
    type: 'trend-line',
    locked: true,
    points: [{ x: 4, y: 101.25 }],
    timestampPoints: [{ timestamp: 1700000000000, price: 99 }],
    coordinateSystem: 'timestamp',
    recalculateTimestamps() {
      this.timestampPoints = this.points.map((p) => ({
        timestamp: dm.chart.data[Math.round(p.x)].t,
        price: p.y,
      }));
      this.coordinateSystem = 'timestamp';
    },
    toJSON() {
      return {
        id: this.id,
        type: this.type,
        points: this.timestampPoints,
        coordinateSystem: this.coordinateSystem,
      };
    },
  };

  const serialized = dm._serializeDrawingForStorage(drawing);

  assert.equal(serialized.coordinateSystem, 'timestamp');
  assert.equal(serialized.points[0].timestamp, 1700000240000);
  assert.equal(serialized.points[0].price, 101.25);
  assert.equal(serialized.locked, true);
});
