/**
 * Remote logos (TradingView-style polish): CoinCap crypto icons + FMP stock logos.
 * Falls back to SVG badges in SymbolBadge when CDN fails or asset unknown.
 */

export type BadgeAsset = "Forex" | "Futures" | "Crypto" | "Stocks" | "Equities";

export function normalizeBadgeAsset(a?: string): Exclude<BadgeAsset, "Equities"> | undefined {
  if (!a) return undefined;
  if (a === "Equities") return "Stocks";
  if (a === "Forex" || a === "Futures" || a === "Crypto" || a === "Stocks") return a;
  return undefined;
}

const QUOTE_TAIL = /(USDT|USDC|USD|PERP|SWAP)$/i;

/** CoinCap icon slug (filename base before @2x.png). */
export function cryptoCoincapSlug(sym: string): string | null {
  let raw = String(sym || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  raw = raw.replace(QUOTE_TAIL, "");
  raw = raw.replace(/^\d+/, "");
  if (!raw) return null;

  const map: Record<string, string> = {
    BTC: "btc",
    ETH: "eth",
    SOL: "sol",
    XRP: "xrp",
    DOGE: "doge",
    ADA: "ada",
    DOT: "dot",
    AVAX: "avax",
    ATOM: "atom",
    LINK: "link",
    LTC: "ltc",
    MATIC: "matic",
    UNI: "uni",
    BNB: "bnb",
    BCH: "bch",
    TRX: "trx",
    SHIB: "shiba-inu",
    PEPE: "pepe",
    APT: "apt",
    ARB: "arb",
    OP: "op",
    NEAR: "near",
    FIL: "fil",
    ICP: "icp",
    HBAR: "hbar",
    VET: "vet",
    IMX: "imx",
    SNX: "snx",
    COMP: "comp",
    GRT: "grt",
    AAVE: "aave",
    MKR: "mkr",
    INJ: "inj",
    STX: "stx",
    TIA: "tia",
    RNDR: "rndr",
    WLD: "wld",
    SEI: "sei",
    STRK: "strk",
    SUI: "sui",
    CRV: "crv",
    LDO: "ldo",
    FTM: "ftm",
    EOS: "eos",
    XTZ: "xtz",
    XLM: "xlm",
    ALGO: "algo",
    FLOW: "flow",
    ZEC: "zec",
    DASH: "dash",
    ENJ: "enj",
    MANA: "mana",
    SAND: "sand",
    AXS: "axs",
    CHZ: "chz",
    THETA: "theta",
    BAT: "bat",
    ZIL: "zil",
    EGLD: "egld",
    KAVA: "kava",
    RUNE: "rune",
    QNT: "qnt",
    MINA: "mina",
    FLR: "flr",
    GALA: "gala",
    MASK: "mask",
    ENS: "ens",
    BLUR: "blur",
    PEOPLE: "people",
    JTO: "jto",
    PYTH: "pyth",
    JUP: "jup",
    WIF: "wif",
    BONK: "bonk",
    ORDI: "ordi",
    STG: "stg",
    FXS: "fxs",
    AR: "ar",
    ROSE: "rose",
    ONE: "harmony",
    CELO: "celo",
    KSM: "ksm",
    YFI: "yfi",
    SUSHI: "sushi",
    WAVES: "waves",
    QTUM: "qtum",
    OMG: "omg",
    LRC: "loopring",
    ANKR: "ankr",
    STORJ: "storj",
  };

  if (map[raw]) return map[raw];
  return raw.toLowerCase();
}

export function cryptoLogoCandidates(sym: string): string[] {
  const slug = cryptoCoincapSlug(sym);
  if (!slug) return [];
  return [
    `https://assets.coincap.io/assets/icons/${slug}@2x.png`,
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${slug}.png`,
  ];
}

export function stockLogoCandidates(sym: string): string[] {
  const t = String(sym || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!t) return [];
  return [`https://financialmodelingprep.com/image-stock/${t}.png`];
}

/** TradingView-like futures badge accents (deterministic). */
export function futuresBadgeColors(root: string): { bg: string; fg: string } {
  const r = String(root || "").toUpperCase();
  const preset: Record<string, { bg: string; fg: string }> = {
    ES: { bg: "#123a5c", fg: "#e3f2ff" },
    NQ: { bg: "#3b1570", fg: "#f3e8ff" },
    MNQ: { bg: "#3b1570", fg: "#f3e8ff" },
    MES: { bg: "#123a5c", fg: "#e3f2ff" },
    YM: { bg: "#3d2914", fg: "#ffe8c8" },
    MYM: { bg: "#3d2914", fg: "#ffe8c8" },
    RTY: { bg: "#14263d", fg: "#dcecff" },
    M2K: { bg: "#14263d", fg: "#dcecff" },
    CL: { bg: "#1a2f22", fg: "#c8ffd4" },
    MCL: { bg: "#1a2f22", fg: "#c8ffd4" },
    GC: { bg: "#3d3010", fg: "#ffeaa3" },
    MGC: { bg: "#3d3010", fg: "#ffeaa3" },
    SI: { bg: "#252838", fg: "#dde4ff" },
    NG: { bg: "#132238", fg: "#cfe9ff" },
    HG: { bg: "#4a2810", fg: "#ffd9bf" },
    PL: { bg: "#222428", fg: "#eaeaff" },
    RB: { bg: "#261818", fg: "#ffd6d6" },
    HO: { bg: "#2a2218", fg: "#ffe8c4" },
    ZB: { bg: "#1e2430", fg: "#dbe7ff" },
    ZN: { bg: "#1e2430", fg: "#dbe7ff" },
    ZF: { bg: "#1e2430", fg: "#dbe7ff" },
    ZT: { bg: "#1e2430", fg: "#dbe7ff" },
    "6E": { bg: "#153040", fg: "#d8f4ff" },
    "6B": { bg: "#153040", fg: "#d8f4ff" },
    "6J": { bg: "#153040", fg: "#d8f4ff" },
    MBT: { bg: "#2d1f08", fg: "#ffdca8" },
    MBTX: { bg: "#2d1f08", fg: "#ffdca8" },
    NKD: { bg: "#301828", fg: "#ffd6ea" },
  };
  if (preset[r]) return preset[r];
  let h = 0;
  for (let i = 0; i < r.length; i++) h = (h * 31 + r.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return { bg: `hsl(${hue} 42% 22%)`, fg: `hsl(${hue} 20% 94%)` };
}

export const METAL_BADGES: Record<string, { bg: string; fg: string; label: string }> = {
  XAUUSD: { bg: "#2B2200", fg: "#FFD700", label: "Au" },
  XAGUSD: { bg: "#1C2028", fg: "#C8D4E0", label: "Ag" },
  GC: { bg: "#2B2200", fg: "#FFD700", label: "Au" },
  SI: { bg: "#1C2028", fg: "#C8D4E0", label: "Ag" },
  CL: { bg: "#0D1A12", fg: "#4CAF50", label: "CL" },
  NG: { bg: "#0A1020", fg: "#64B5F6", label: "NG" },
  MGC: { bg: "#1A1200", fg: "#FFBA00", label: "μAu" },
  MCL: { bg: "#071510", fg: "#33CC66", label: "μCL" },
};
