const { getHistoricalRates } = require("dukascopy-node");
const fs = require("fs");

(async () => {
  const data = await getHistoricalRates({
    instrument: "eurusd",
    dates: {
      from: new Date("2022-03-19"),
      to: new Date("2025-01-01"),
    },
    timeframe: "m1",
    format: "csv",
  });
  
  // Save to file
  fs.writeFileSync("eurusd_data.csv", data);
  console.log("Data saved to eurusd_data.csv");
})();