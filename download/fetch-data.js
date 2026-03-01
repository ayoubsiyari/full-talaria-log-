const { getHistoricalRates } = require("dukascopy-node");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for argument --${key}`);
    }
    out[key] = value;
    i += 1;
  }
  return out;
}

function ensureValidDate(value, label) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ${label} date: ${value}`);
  }
  return d;
}

(async () => {
  try {
    const args = parseArgs(process.argv.slice(2));
    const instrument = (args.instrument || "eurusd").toLowerCase();
    const timeframe = (args.timeframe || "m1").toLowerCase();
    const fromStr = args.from || "2022-03-19";
    const toStr = args.to || "2025-01-01";

    const fromDate = ensureValidDate(fromStr, "from");
    const toDate = ensureValidDate(toStr, "to");
    if (fromDate > toDate) {
      throw new Error("The from date must be before or equal to the to date");
    }

    const data = await getHistoricalRates({
      instrument,
      dates: {
        from: fromDate,
        to: toDate,
      },
      timeframe,
      format: "csv",
    });

    const defaultOut = `${instrument}-${timeframe}-${fromStr}-${toStr}.csv`;
    const outputPath = path.resolve(args.out || defaultOut);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, data);

    console.log(`Data saved to ${outputPath}`);
    console.log(`DATA_FILE=${outputPath}`);
  } catch (err) {
    console.error(`Dukascopy fetch failed: ${err.message || err}`);
    process.exit(1);
  }
})();