/** CFTC Public Reporting — Legacy Combined (futures + options), dataset jun7-fc8e */
export type CotAssetGroup = "forex" | "commodities" | "indices" | "bonds" | "crypto";

export type CotInstrumentDef = {
  sym: string;
  code: string;
  group: CotAssetGroup;
};

export const COT_INSTRUMENTS: CotInstrumentDef[] = [
  { sym: "EUR/USD", code: "099741", group: "forex" },
  { sym: "GBP/USD", code: "096742", group: "forex" },
  { sym: "USD/JPY", code: "097741", group: "forex" },
  { sym: "AUD/USD", code: "232741", group: "forex" },
  { sym: "USD/CAD", code: "090741", group: "forex" },
  { sym: "NZD/USD", code: "112741", group: "forex" },
  { sym: "USD/CHF", code: "092741", group: "forex" },
  { sym: "GC (Gold)", code: "088691", group: "commodities" },
  { sym: "SI (Silver)", code: "084691", group: "commodities" },
  { sym: "CL (WTI)", code: "067651", group: "commodities" },
  { sym: "HG (Copper)", code: "085692", group: "commodities" },
  { sym: "ES (S&P)", code: "13874A", group: "indices" },
  { sym: "NQ (Nasdaq)", code: "209741", group: "indices" },
  { sym: "RTY (Russell)", code: "239742", group: "indices" },
  { sym: "YM (Dow)", code: "124603", group: "indices" },
  { sym: "ZB (30Y)", code: "020601", group: "bonds" },
  { sym: "ZN (10Y)", code: "042601", group: "bonds" },
  { sym: "BTC", code: "133741", group: "crypto" },
  { sym: "MBT (Micro BTC)", code: "133742", group: "crypto" },
];
