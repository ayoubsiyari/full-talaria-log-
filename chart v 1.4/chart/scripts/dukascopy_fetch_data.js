/**
 * Dukascopy M1 (bid) CSV fetcher — used by api_server admin import jobs.
 *
 * dukascopy-node returns:
 *   - string when format=csv and there is data
 *   - [] when there is no data in the range (even with format=csv)
 *   - array-of-arrays when format=array
 * Normalize all of those to a CSV file the Python importer can merge.
 */
const { getHistoricalRates } = require("dukascopy-node");
const fs = require("fs");
const path = require("path");

const OHLCV_HEADER = "timestamp,open,high,low,close,volume";

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

function rowToCsvLine(row) {
  if (Array.isArray(row)) {
    return row.map((v) => (v == null ? "" : String(v))).join(",");
  }
  if (row && typeof row === "object") {
    const ts = row.timestamp != null ? row.timestamp : row.time;
    return [ts, row.open, row.high, row.low, row.close, row.volume]
      .map((v) => (v == null ? "" : String(v)))
      .join(",");
  }
  return "";
}

/**
 * Convert dukascopy-node output into a CSV string.
 * Returns { csv, rowCount } — rowCount excludes the header.
 */
function normalizeToCsv(data) {
  if (data == null) {
    return { csv: OHLCV_HEADER + "\n", rowCount: 0 };
  }
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) {
      return { csv: OHLCV_HEADER + "\n", rowCount: 0 };
    }
    // Already CSV (may or may not include header).
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    const first = (lines[0] || "").toLowerCase();
    const hasHeader = first.includes("timestamp") || first.includes("open");
    const bodyLines = hasHeader ? lines.slice(1) : lines;
    const csv = (hasHeader ? lines.join("\n") : OHLCV_HEADER + "\n" + lines.join("\n")) + "\n";
    return { csv, rowCount: bodyLines.length };
  }
  if (Buffer.isBuffer(data)) {
    return normalizeToCsv(data.toString("utf8"));
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      // dukascopy-node returns [] for empty ranges even when format=csv.
      return { csv: OHLCV_HEADER + "\n", rowCount: 0 };
    }
    const body = data.map(rowToCsvLine).filter(Boolean);
    return { csv: OHLCV_HEADER + "\n" + body.join("\n") + "\n", rowCount: body.length };
  }
  throw new Error(
    `Unexpected Dukascopy payload type: ${Object.prototype.toString.call(data)}`
  );
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

    // Dukascopy often drops long M1 pulls with ECONNRESET / socket hang up.
    // Library default retryCount is 0 — one blip fails the whole chunk.
    const retryCount = Math.max(0, parseInt(args.retries || "5", 10) || 5);
    const pauseBetweenRetriesMs = Math.max(
      200,
      parseInt(args["retry-pause"] || "1500", 10) || 1500
    );
    const batchSize = Math.max(1, parseInt(args["batch-size"] || "5", 10) || 5);
    const pauseBetweenBatchesMs = Math.max(
      200,
      parseInt(args["batch-pause"] || "1200", 10) || 1200
    );

    console.log(
      `[dukascopy] network retries=${retryCount} retryPauseMs=${pauseBetweenRetriesMs} ` +
        `batchSize=${batchSize} batchPauseMs=${pauseBetweenBatchesMs}`
    );

    let data = null;
    let lastErr = null;
    // Extra outer retries for whole-chunk transient failures (ECONNRESET, etc.).
    const outerTries = Math.max(1, parseInt(args["outer-retries"] || "3", 10) || 3);
    for (let attempt = 1; attempt <= outerTries; attempt += 1) {
      try {
        data = await getHistoricalRates({
          instrument,
          dates: {
            from: fromDate,
            to: toDate,
          },
          timeframe,
          format: "csv",
          // Prefer bid to match previous importer naming (*-m1-bid-*).
          priceType: "bid",
          batchSize,
          pauseBetweenBatchesMs,
          retryCount,
          pauseBetweenRetriesMs,
          failAfterRetryCount: true,
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg = err && err.message ? String(err.message) : String(err);
        const transient = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up|network|fetch failed/i.test(
          msg
        );
        console.error(
          `[dukascopy] attempt ${attempt}/${outerTries} failed: ${msg}` +
            (transient && attempt < outerTries ? " (retrying chunk…)" : "")
        );
        if (!transient || attempt >= outerTries) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, pauseBetweenRetriesMs * attempt));
      }
    }
    if (lastErr) throw lastErr;

    const { csv, rowCount } = normalizeToCsv(data);
    const defaultOut = `${instrument}-${timeframe}-${fromStr}-${toStr}.csv`;
    const outputPath = path.resolve(args.out || defaultOut);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, csv, "utf8");

    console.log(`Data saved to ${outputPath}`);
    console.log(`DATA_FILE=${outputPath}`);
    console.log(`ROW_COUNT=${rowCount}`);
    if (rowCount === 0) {
      console.log("EMPTY_RANGE=1");
    }
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
