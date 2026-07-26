import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSessionAssignments,
  readBackPanelPassports,
} from './session-assignment-contract.mjs';

const session = {
  config: {
    tickers: ['EURUSD', 'AUDUSD', 'GBPUSD'],
    files: [
      { id: 25, ticker: 'EURUSD', name: 'EURUSD_1min.csv', asset_class: 'Forex' },
      { id: 22, ticker: 'AUDUSD', name: 'AUDUSD_1min.csv', asset_class: 'Forex' },
      { id: 27, ticker: 'GBPUSD', name: 'GBPUSD_1min.csv', asset_class: 'Forex' },
    ],
    instruments: {},
  },
};

test('derives three passports only from session config', () => {
  assert.deepEqual(
    deriveSessionAssignments(session).map(({ ticker, fileId, timeframe }) => (
      { ticker, fileId, timeframe }
    )),
    [
      { ticker: 'EURUSD', fileId: '25', timeframe: '1m' },
      { ticker: 'GBPUSD', fileId: '27', timeframe: '1m' },
      { ticker: 'AUDUSD', fileId: '22', timeframe: '1m' },
    ],
  );
});

test('rejects cross-market or extra session tickers', () => {
  assert.throws(() => deriveSessionAssignments({
    config: { ...session.config, tickers: ['EURUSD', 'GBPUSD', 'NQ'] },
  }), /ticker set/);
});

test('rejects missing, duplicate, or invalid file IDs', () => {
  const files = session.config.files.map((row) => (
    row.ticker === 'GBPUSD' ? { ...row, id: null } : row
  ));
  assert.throws(() => deriveSessionAssignments({
    config: { ...session.config, files },
  }), /valid file ID/);
});

test('rejects non-Forex or non-minute datasets', () => {
  const futures = session.config.files.map((row) => (
    row.ticker === 'AUDUSD' ? { ...row, asset_class: 'Futures' } : row
  ));
  assert.throws(() => deriveSessionAssignments({
    config: { ...session.config, files: futures },
  }), /not Forex/);
});

test('requires exact saved three-panel passport readback', () => {
  const assignments = deriveSessionAssignments(session);
  const state = {
    layout: '3',
    panels: assignments.map((row, index) => ({
      index,
      symbol: row.ticker,
      fileId: row.fileId,
      timeframe: row.timeframe,
    })),
  };
  assert.equal(readBackPanelPassports(state, assignments).length, 3);
  state.panels[1].fileId = '631';
  assert.throws(() => readBackPanelPassports(state, assignments), /differs/);
});
