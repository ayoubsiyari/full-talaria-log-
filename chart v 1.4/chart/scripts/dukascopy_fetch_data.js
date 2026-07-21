/**
 * Dukascopy M1 (bid) CSV fetcher — used by api_server admin import jobs.
 * Logs rich error detail on failure so the admin UI / docker logs show the real cause
 * (network timeout, DNS, HTTP status, invalid instrument, etc.).
 */
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

function collectErrorFields(err) {
  const fields = {
    message: err && err.message != null ? String(err.message) : String(err),
    name: err && err.name ? String(err.name) : null,
    code: err && err.code != null ? String(err.code) : null,
    errno: err && err.errno != null ? String(err.errno) : null,
    syscall: err && err.syscall != null ? String(err.syscall) : null,
    hostname: err && err.hostname != null ? String(err.hostname) : null,
    type: err && err.type != null ? String(err.type) : null,
  };
  if (err && err.cause) {
    const c = err.cause;
    fields.cause = c && c.message != null ? String(c.message) : String(c);
    if (c && c.code != null) fields.cause_code = String(c.code);
    if (c && c.errno != null) fields.cause_errno = String(c.errno);
    if (c && c.syscall != null) fields.cause_syscall = String(c.syscall);
    if (c && c.hostname != null) fields.cause_hostname = String(c.hostname);
  }
  return fields;
}

function formatErrorLine(fields) {
  const bits = [`Dukascopy fetch failed: ${fields.message || "unknown error"}`];
  ["code", "errno", "syscall", "hostname", "type", "cause", "cause_code"].forEach((k) => {
    if (fields[k]) bits.push(`${k}=${fields[k]}`);
  });
  return bits.join(" | ");
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

    console.log(
      `[dukascopy] start instrument=${instrument} timeframe=${timeframe} from=${fromStr} to=${toStr}`
    );

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
    const fields = collectErrorFields(err);
    console.error(formatErrorLine(fields));
    try {
      console.error(`DUKASCOPY_ERROR_JSON=${JSON.stringify(fields)}`);
    } catch (_) {
      /* ignore */
    }
    if (err && err.stack) {
      console.error(String(err.stack));
    }
    process.exit(1);
  }
})();
