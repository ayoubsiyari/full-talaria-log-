/** CFTC Public Reporting — Legacy Combined (futures + options), dataset jun7-fc8e */

/** Coarse bucket for UI accents (derived from commodity subgroup / group). */
export type CotAssetGroup =
  | "forex"
  | "commodities"
  | "indices"
  | "bonds"
  | "crypto"
  | "other";

export type CotInstrumentDef = {
  /** Short label (contract or market name). */
  sym: string;
  cftc_contract_market_code: string;
  /** Same as cftc_contract_market_code; kept for CSV/export compatibility. */
  code: string;
  group: CotAssetGroup;
  commodityGroup: string | null;
  commoditySubgroup: string | null;
  commodityName: string | null;
};

/** Map CFTC commodity subgroup / group to a coarse UI bucket. */
export function inferLegacyGroup(
  commodityGroup: string | null | undefined,
  commoditySubgroup: string | null | undefined
): CotAssetGroup {
  const sub = (commoditySubgroup || "").toUpperCase();
  const g = (commodityGroup || "").toUpperCase();
  if (sub.includes("CURRENCY")) return "forex";
  if (sub === "STOCK INDICES" || sub.includes("STOCK INDICES")) return "indices";
  if (
    sub.includes("TREASURY") ||
    sub.includes("INTEREST RATE") ||
    sub.includes("SWAPS") ||
    sub.includes("NON-U.S. TREASURY")
  ) {
    return "bonds";
  }
  if (sub.includes("DIGITAL ASSET")) return "crypto";
  if (
    g.includes("AGRICULTURE") ||
    g.includes("NATURAL") ||
    sub.includes("METALS") ||
    sub.includes("PETROLEUM") ||
    sub.includes("GAS") ||
    sub.includes("GRAINS") ||
    sub.includes("OILSEED") ||
    sub.includes("LIVESTOCK") ||
    sub.includes("DAIRY") ||
    sub.includes("FIBER") ||
    sub.includes("WOOD") ||
    sub.includes("FOODSTUFFS") ||
    sub.includes("CHEMICALS") ||
    sub.includes("ELECTRICITY") ||
    sub.includes("EMISSIONS")
  ) {
    return "commodities";
  }
  if (g.includes("FINANCIAL")) return "bonds";
  return "other";
}

/**
 * CFTC contract market codes (Legacy Combined) loaded with full weekly history on
 * first paint. All other markets use latest report only until the user opens them.
 */
export const COT_POPULAR_CODES: readonly string[] = [
  "099741",
  "096742",
  "097741",
  "232741",
  "090741",
  "112741",
  "092741",
  "088691",
  "084691",
  "067651",
  "085692",
  "13874A",
  "209741",
  "239742",
  "124603",
  "020601",
  "042601",
  "133741",
  "133742",
] as const;
