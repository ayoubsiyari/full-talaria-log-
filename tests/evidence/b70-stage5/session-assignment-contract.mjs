const EXPECTED_SYMBOLS = Object.freeze(['EURUSD', 'GBPUSD', 'AUDUSD']);

const upper = (value) => String(value || '').trim().toUpperCase();

export function deriveSessionAssignments(session, expectedSymbols = EXPECTED_SYMBOLS) {
  const config = session?.config;
  if (!config || typeof config !== 'object') throw new Error('session config is absent');
  const expected = expectedSymbols.map(upper);
  if (expected.length !== 3 || new Set(expected).size !== 3) {
    throw new Error('expected symbol contract must contain exactly three distinct symbols');
  }

  const files = Array.isArray(config.files) ? config.files : [];
  const instruments = config.instruments && typeof config.instruments === 'object'
    ? config.instruments : {};
  const configured = Array.isArray(config.tickers) ? config.tickers.map(upper) : [];
  if (configured.length !== 3 || new Set(configured).size !== 3
      || configured.some((symbol) => !expected.includes(symbol))
      || expected.some((symbol) => !configured.includes(symbol))) {
    throw new Error('session ticker set differs from the exact three-symbol contract');
  }

  const assignments = expected.map((symbol) => {
    const file = files.find((row) => upper(row?.ticker || row?.symbol) === symbol);
    const instrument = instruments[symbol];
    const fileId = Number(file?.id ?? instrument?.fileId);
    const fileName = String(file?.name ?? instrument?.fileName ?? '');
    const assetClass = upper(file?.asset_class ?? instrument?.asset_class ?? instrument?.asset);
    if (!Number.isSafeInteger(fileId) || fileId <= 0) {
      throw new Error(`${symbol} has no valid file ID`);
    }
    if (assetClass !== 'FOREX') throw new Error(`${symbol} is not Forex`);
    if (!/_1min\.csv$/i.test(fileName)) throw new Error(`${symbol} is not backed by 1-minute data`);
    return Object.freeze({ ticker: symbol, fileId: String(fileId), timeframe: '1m', fileName });
  });
  if (new Set(assignments.map((row) => row.fileId)).size !== assignments.length) {
    throw new Error('session assigns the same file ID to multiple symbols');
  }
  return assignments;
}

export function readBackPanelPassports(panelState, assignments) {
  if (!panelState || !/^3(?:v|h|l|r|t|b)$/.test(String(panelState.layout))
      || !Array.isArray(panelState.panels)
      || panelState.panels.length !== 3) {
    throw new Error('saved panel state is not a valid three-panel layout');
  }
  const passports = panelState.panels.map((panel) => ({
    ticker: upper(panel?.symbol || panel?.ticker),
    fileId: String(panel?.fileId ?? panel?.file_id ?? ''),
    timeframe: String(panel?.timeframe || ''),
  }));
  assignments.forEach((expected, index) => {
    const actual = passports[index];
    if (actual.ticker !== expected.ticker || actual.fileId !== expected.fileId
        || actual.timeframe !== expected.timeframe) {
      throw new Error(`panel ${index} passport differs from session config`);
    }
  });
  return passports;
}

export { EXPECTED_SYMBOLS };
