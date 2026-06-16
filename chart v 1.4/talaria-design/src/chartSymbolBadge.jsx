/**
 * Chart V9: TradingView-style instrument badges (CoinCap / FMP / futures pills / Forex flags).
 * Mirrors homepage backtestModal SymbolBadge + symbolIcons + FlagSvg.
 */
import React, { useEffect, useMemo, useState } from "react";

export const currencyCountry = {
  EUR: "EU",
  JPY: "JP",
  USD: "US",
  GBP: "GB",
  AUD: "AU",
  CAD: "CA",
  CHF: "CH",
  NZD: "NZ",
  SEK: "SE",
  NOK: "NO",
  DKK: "DK",
  SGD: "SG",
  HKD: "HK",
  MXN: "MX",
  ZAR: "ZA",
  TRY: "TR",
  PLN: "PL",
  CZK: "CZ",
  HUF: "HU",
};

export function FlagSvg({ code, w = 22, h = 14 }) {
  const sw = { width: w, height: h, viewBox: "0 0 22 14", style: { display: "block", flexShrink: 0 } };
  const cc = currencyCountry[code] || code;
  const f = {
    EU: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#003399" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          return <circle key={i} cx={11 + 4.8 * Math.cos(a)} cy={7 + 4.8 * Math.sin(a)} r={0.85} fill="#FFCC00" />;
        })}
      </svg>
    ),
    JP: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#fff" />
        <circle cx={11} cy={7} r={4} fill="#BC002D" />
      </svg>
    ),
    US: (
      <svg {...sw}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => (
          <rect key={i} y={(i * 14) / 13} width={22} height={14 / 13 + 0.2} fill={i % 2 === 0 ? "#B22234" : "#fff"} />
        ))}
        <rect width={9} height={7.5} fill="#3C3B6E" />
        {Array.from({ length: 18 }, (_, i) => {
          const col = i % 6,
            row = Math.floor(i / 6);
          return <circle key={i} cx={0.9 + col * 1.45 + (row % 2 === 0 ? 0 : 0.72)} cy={0.9 + row * 2.4} r={0.42} fill="#fff" />;
        })}
      </svg>
    ),
    GB: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#012169" />
        <line x1={0} y1={0} x2={22} y2={14} stroke="#fff" strokeWidth={4} />
        <line x1={22} y1={0} x2={0} y2={14} stroke="#fff" strokeWidth={4} />
        <line x1={0} y1={0} x2={22} y2={14} stroke="#C8102E" strokeWidth={2} />
        <line x1={22} y1={0} x2={0} y2={14} stroke="#C8102E" strokeWidth={2} />
        <rect x={9.5} y={0} width={3} height={14} fill="#fff" />
        <rect x={0} y={5.5} width={22} height={3} fill="#fff" />
        <rect x={10} y={0} width={2} height={14} fill="#C8102E" />
        <rect x={0} y={6} width={22} height={2} fill="#C8102E" />
      </svg>
    ),
    AU: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#00008B" />
        <line x1={0} y1={0} x2={9} y2={7} stroke="#fff" strokeWidth={2.5} />
        <line x1={9} y1={0} x2={0} y2={7} stroke="#fff" strokeWidth={2.5} />
        <line x1={0} y1={0} x2={9} y2={7} stroke="#C8102E" strokeWidth={1.2} />
        <line x1={9} y1={0} x2={0} y2={7} stroke="#C8102E" strokeWidth={1.2} />
        <rect x={3.8} y={0} width={1.4} height={7} fill="#fff" />
        <rect x={0} y={2.8} width={9} height={1.4} fill="#fff" />
        <rect x={4.1} y={0} width={0.8} height={7} fill="#C8102E" />
        <rect x={0} y={3.1} width={9} height={0.8} fill="#C8102E" />
        <circle cx={4.5} cy={10.5} r={1.6} fill="#fff" opacity={0.9} />
        <circle cx={15} cy={3.5} r={1.1} fill="#fff" />
        <circle cx={13} cy={8} r={0.9} fill="#fff" />
        <circle cx={18} cy={7.5} r={0.9} fill="#fff" />
        <circle cx={19} cy={4.5} r={0.8} fill="#fff" />
      </svg>
    ),
    CA: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#fff" />
        <rect width={5.5} height={14} fill="#FF0000" />
        <rect x={16.5} width={5.5} height={14} fill="#FF0000" />
        <path d="M11,2 L12,5 L14.5,4.5 L13,6 L15,7 L11.5,8.5 L12,11 L11,10 L10,11 L10.5,8.5 L7,7 L9,6 L7.5,4.5 L10,5 Z" fill="#FF0000" />
      </svg>
    ),
    CH: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#FF0000" />
        <rect x={9.5} y={2.5} width={3} height={9} fill="#fff" />
        <rect x={5.5} y={5.5} width={11} height={3} fill="#fff" />
      </svg>
    ),
    DE: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#000" />
        <rect y={4.67} width={22} height={4.66} fill="#DD0000" />
        <rect y={9.33} width={22} height={4.67} fill="#FFCE00" />
      </svg>
    ),
    FR: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#002395" />
        <rect x={7.33} width={7.34} height={14} fill="#fff" />
        <rect x={14.67} width={7.33} height={14} fill="#ED2939" />
      </svg>
    ),
    IT: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#009246" />
        <rect x={7.33} width={7.34} height={14} fill="#fff" />
        <rect x={14.67} width={7.33} height={14} fill="#CE2B37" />
      </svg>
    ),
    CN: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#DE2910" />
        <polygon points="3.5,1.5 4.2,3.6 6.2,3.6 4.6,4.8 5.3,6.9 3.5,5.6 1.7,6.9 2.4,4.8 0.8,3.6 2.8,3.6" fill="#FFDE00" />
      </svg>
    ),
    NZ: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#00247D" />
        <line x1={0} y1={0} x2={9} y2={7} stroke="#fff" strokeWidth={2.5} />
        <line x1={9} y1={0} x2={0} y2={7} stroke="#fff" strokeWidth={2.5} />
        <line x1={0} y1={0} x2={9} y2={7} stroke="#C8102E" strokeWidth={1.2} />
        <line x1={9} y1={0} x2={0} y2={7} stroke="#C8102E" strokeWidth={1.2} />
        <rect x={3.8} y={0} width={1.4} height={7} fill="#fff" />
        <rect x={0} y={2.8} width={9} height={1.4} fill="#fff" />
        <rect x={4.1} y={0} width={0.8} height={7} fill="#C8102E" />
        <rect x={0} y={3.1} width={9} height={0.8} fill="#C8102E" />
        <circle cx={14} cy={3} r={1.2} fill="#CC142B" stroke="#fff" strokeWidth={0.4} />
        <circle cx={18} cy={5.5} r={1} fill="#CC142B" stroke="#fff" strokeWidth={0.4} />
        <circle cx={17} cy={9.5} r={1} fill="#CC142B" stroke="#fff" strokeWidth={0.4} />
        <circle cx={13.5} cy={7.5} r={0.8} fill="#CC142B" stroke="#fff" strokeWidth={0.3} />
      </svg>
    ),
    SE: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#006AA7" />
        <rect x={6} y={0} width={3} height={14} fill="#FECC02" />
        <rect x={0} y={5.5} width={22} height={3} fill="#FECC02" />
      </svg>
    ),
    NO: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#EF2B2D" />
        <rect x={5.5} y={0} width={4} height={14} fill="#fff" />
        <rect x={0} y={5} width={22} height={4} fill="#fff" />
        <rect x={7} y={0} width={1.5} height={14} fill="#003680" />
        <rect x={0} y={6.25} width={22} height={1.5} fill="#003680" />
      </svg>
    ),
    DK: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#C60C30" />
        <rect x={6} y={0} width={3} height={14} fill="#fff" />
        <rect x={0} y={5.5} width={22} height={3} fill="#fff" />
      </svg>
    ),
    SG: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#EF3340" />
        <rect y={7} width={22} height={7} fill="#fff" />
        <circle cx={5.5} cy={7} r={2.5} fill="#fff" />
        <circle cx={7} cy={7} r={2.4} fill="#EF3340" />
      </svg>
    ),
    HK: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#DE2910" />
      </svg>
    ),
    MX: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#006847" />
        <rect x={7.33} width={7.34} height={14} fill="#fff" />
        <rect x={14.67} width={7.33} height={14} fill="#CE1126" />
      </svg>
    ),
    ZA: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#007A4D" />
      </svg>
    ),
    TR: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#E30A17" />
      </svg>
    ),
    PL: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#fff" />
        <rect y={7} width={22} height={7} fill="#DC143C" />
      </svg>
    ),
    CZ: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#D7141A" />
        <rect width={22} height={7} fill="#fff" />
      </svg>
    ),
    HU: (
      <svg {...sw}>
        <rect width={22} height={14} fill="#CE2939" />
        <rect y={4.67} width={22} height={4.66} fill="#fff" />
      </svg>
    ),
  };
  return (
    f[cc] || (
      <svg {...sw}>
        <rect width={22} height={14} fill="#1a2030" />
        <text x={11} y={10} textAnchor="middle" fontSize={6} fontWeight="bold" fill="#8CA0FF" fontFamily="sans-serif">
          {cc}
        </text>
      </svg>
    )
  );
}

const QUOTE_TAIL = /(USDT|USDC|USD|PERP|SWAP)$/i;

function cryptoCoincapSlug(sym) {
  let raw = String(sym || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  raw = raw.replace(QUOTE_TAIL, "");
  raw = raw.replace(/^\d+/, "");
  if (!raw) return null;

  const map = {
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

function cryptoLogoCandidates(sym) {
  const slug = cryptoCoincapSlug(sym);
  if (!slug) return [];
  return [
    `https://assets.coincap.io/assets/icons/${slug}@2x.png`,
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${slug}.png`,
  ];
}

function stockLogoCandidates(sym) {
  const t = String(sym || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (!t) return [];
  return [`https://financialmodelingprep.com/image-stock/${t}.png`];
}

function futuresBadgeColors(root) {
  const r = String(root || "").toUpperCase();
  const preset = {
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

const METAL_BADGES = {
  XAUUSD: { bg: "#2B2200", fg: "#FFD700", label: "Au" },
  XAGUSD: { bg: "#1C2028", fg: "#C8D4E0", label: "Ag" },
  GC: { bg: "#2B2200", fg: "#FFD700", label: "Au" },
  SI: { bg: "#1C2028", fg: "#C8D4E0", label: "Ag" },
  CL: { bg: "#0D1A12", fg: "#4CAF50", label: "CL" },
  NG: { bg: "#0A1020", fg: "#64B5F6", label: "NG" },
  MGC: { bg: "#1A1200", fg: "#FFBA00", label: "μAu" },
  MCL: { bg: "#071510", fg: "#33CC66", label: "μCL" },
};

export function normalizeBadgeAsset(a) {
  if (!a) return undefined;
  const s = String(a).trim();
  if (!s) return undefined;
  if (/^equities$/i.test(s)) return "Stocks";
  if (/^(forex|futures|crypto|stocks)$/i.test(s)) return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (s === "Equities") return "Stocks";
  if (s === "Forex" || s === "Futures" || s === "Crypto" || s === "Stocks") return s;
  return undefined;
}

/** Longest root first so `MES` does not steal `MESA`, and `RB` does not steal `RBA`. */
const FUTURES_ROOTS_FOR_INFER = [
  "MNQ",
  "MES",
  "MYM",
  "M2K",
  "MGC",
  "MCL",
  "MBTX",
  "NKD",
  "MBT",
  "RTY",
  "ES",
  "NQ",
  "YM",
  "CL",
  "GC",
  "SI",
  "NG",
  "HG",
  "PL",
  "ZB",
  "ZN",
  "ZF",
  "ZT",
  "HO",
  "HOG",
  "RB",
  "6E",
  "6B",
  "6J",
  "6A",
  "6C",
  "6S",
].sort((a, b) => b.length - a.length);

function futuresSuffixLooksLikeContract(rest) {
  if (rest === "") return true;
  if (/^\d/.test(rest)) return true;
  // CME-style month letter + 2–4 digit year (MESZ24, RBZ2024)
  if (/^[FGHJKMNQUVXZ]\d{2,4}$/i.test(rest)) return true;
  return false;
}

export function inferChartAssetClass(ticker) {
  const u = String(ticker || "")
    .replace(/[\s/\-_.]/g, "")
    .toUpperCase();
  if (!u) return "Futures";

  if (/(BTC|ETH|BNB|SOL|ADA|XRP|DOGE|DOT|AVAX|LINK|MATIC|UNI|USDT|USDC|PERP|SWAP)/.test(u)) return "Crypto";

  for (const root of FUTURES_ROOTS_FOR_INFER) {
    if (!u.startsWith(root)) continue;
    const rest = u.slice(root.length);
    if (futuresSuffixLooksLikeContract(rest)) return "Futures";
  }

  if (u.length === 6) {
    const b = u.slice(0, 3),
      q = u.slice(3);
    if (currencyCountry[b] && currencyCountry[q]) return "Forex";
  }

  if (/^[A-Z]{6}$/.test(u)) return "Forex";

  const KNOWN_STOCKS = new Set([
    "AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOG", "GOOGL", "META", "NFLX", "AMD", "INTC",
  ]);
  if (KNOWN_STOCKS.has(u)) return "Stocks";

  if (/^[A-Z]{1,5}$/.test(u)) return "Futures";

  return "Futures";
}

export function extractDatasetTicker(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const noExt = s.replace(/\.(csv|CSV)$/i, "");
  const flat = noExt.replace(/[\s_\-./]/g, "").toUpperCase();
  if (flat.length >= 6) {
    const m = flat.match(/([A-Z]{6})/);
    if (m) {
      const p = m[1];
      const b = p.slice(0, 3);
      const q = p.slice(3);
      if (currencyCountry[b] && currencyCountry[q]) return `${b}/${q}`;
    }
  }
  const tfStrip = flat.replace(/(M\d+|MIN|H\d+|D\d+|W\d+).*$/i, "");
  if (tfStrip && tfStrip.length >= 2) return tfStrip;
  const head = noExt.split(/[_\-.]/)[0];
  return head ? head.toUpperCase() : flat;
}

export function normalizeSymForBadge(symbol) {
  const extracted = extractDatasetTicker(symbol);
  return String(extracted || symbol || "")
    .replace(/\//g, "")
    .toUpperCase();
}

export function chartAssetFromSymbolObj(s) {
  if (!s) return "";
  const hinted = normalizeBadgeAsset(s.badgeAsset || s.assetClass || s.asset_class);
  if (hinted) return hinted;
  const t = s.type;
  if (t === "forex") return "Forex";
  if (t === "futures") return "Futures";
  if (t === "stock") return "Stocks";
  if (t === "crypto") return "Crypto";
  if (t === "commodity") return "Forex";
  return inferChartAssetClass(String(s.id || ""));
}

export function resolveSessionChartSymbol(symbol, allSymbols) {
  const hit = allSymbols.find(x => x.id === symbol);
  if (hit) return hit;
  const str = String(symbol || "");
  const parts = str.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0].length === 3 && parts[1].length === 3) {
    const b = parts[0].toUpperCase(),
      q = parts[1].toUpperCase();
    return { id: `${b}/${q}`, name: `${b} / ${q}`, type: "forex", base: b, quote: q };
  }
  const flat = normalizeSymForBadge(str);
  const ac = inferChartAssetClass(flat || str);
  if (ac === "Forex" && flat.length === 6) {
    const b = flat.slice(0, 3),
      q = flat.slice(3);
    return { id: `${b}/${q}`, name: `${b} / ${q}`, type: "forex", base: b, quote: q };
  }
  const tm = { Forex: "forex", Futures: "futures", Stocks: "stock", Crypto: "crypto" };
  return { id: str || flat, name: str || flat, type: tm[ac] || "other" };
}

function futuresRoot(sym) {
  const u = String(sym || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const cut = u.search(/\d/);
  return cut > 0 ? u.slice(0, cut) : u;
}

function genericLetterBadge(sym, w, h, fontFamily) {
  const label =
    String(sym || "")
      .replace(/USDT|USDC|USD$/i, "")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase() || "?";
  const rx = Math.round(h * 0.35);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", flexShrink: 0, borderRadius: rx, boxShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
      <rect width={w} height={h} rx={rx} fill="#22324A" />
      <text x={w / 2} y={h * 0.73} textAnchor="middle" fill="#D7E6FF" fontSize={h * 0.45} fontWeight="800" fontFamily={fontFamily}>
        {label}
      </text>
    </svg>
  );
}

function futuresSvg(sym, w, h, fontFamily) {
  const root = futuresRoot(sym).slice(0, 6);
  const { bg, fg } = futuresBadgeColors(root);
  const label = root.slice(0, 4);
  const rx = Math.round(h * 0.3);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", flexShrink: 0, borderRadius: rx, boxShadow: "0 1px 3px rgba(0,0,0,0.65)" }}>
      <rect width={w} height={h} rx={rx} fill={bg} />
      <text
        x={w / 2}
        y={h * 0.72}
        textAnchor="middle"
        fill={fg}
        fontSize={h * (label.length >= 4 ? 0.38 : 0.48)}
        fontWeight="800"
        fontFamily={fontFamily}
      >
        {label}
      </text>
    </svg>
  );
}

export function ChartSymbolBadge({ sym, asset, w = 11, h = 10, fontFamily = "'Exo 2', sans-serif" }) {
  const normAsset = normalizeBadgeAsset(asset);
  const upper = String(sym || "").toUpperCase();

  const urls = useMemo(() => {
    if (normAsset === "Crypto") return cryptoLogoCandidates(sym);
    if (normAsset === "Stocks") return stockLogoCandidates(sym);
    return [];
  }, [normAsset, sym]);

  const [srcIdx, setSrcIdx] = useState(0);
  useEffect(() => {
    setSrcIdx(0);
  }, [sym, normAsset]);

  const metal = METAL_BADGES[upper];
  if (metal) {
    const rx = Math.round(h * 0.2);
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", flexShrink: 0, borderRadius: rx, boxShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
        <rect width={w} height={h} rx={rx} fill={metal.bg} />
        <text x={w / 2} y={h * 0.73} textAnchor="middle" fill={metal.fg} fontSize={h * 0.52} fontWeight="800" fontFamily={fontFamily}>
          {metal.label}
        </text>
      </svg>
    );
  }

  const isFxPair =
    upper.length === 6 && !!currencyCountry[upper.slice(0, 3)] && !!currencyCountry[upper.slice(3, 6)];

  if (isFxPair) {
    const fw = Math.round((w * 15) / 11);
    const fh = h;
    const b = upper.slice(0, 3);
    const q = upper.slice(3, 6);
    return (
      <div style={{ position: "relative", width: Math.round((w * 22) / 11), height: fh, flexShrink: 0 }}>
        <div style={{ position: "absolute", left: 0, top: 0, borderRadius: 2, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.7)", zIndex: 2 }}>
          <FlagSvg code={b} w={fw} h={fh} />
        </div>
        <div
          style={{
            position: "absolute",
            left: Math.round((w * 7) / 11),
            top: 0,
            borderRadius: 2,
            overflow: "hidden",
            boxShadow: "0 1px 2px rgba(0,0,0,0.5)",
            zIndex: 1,
          }}
        >
          <FlagSvg code={q} w={fw} h={fh} />
        </div>
      </div>
    );
  }

  if (normAsset === "Futures") {
    return (
      <div style={{ borderRadius: 2, overflow: "hidden", flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.55)" }}>
        <FlagSvg code="US" w={w} h={h} />
      </div>
    );
  }

  const src = urls[srcIdx];
  if (src) {
    const rx = Math.round(h * 0.35);
    return (
      <img
        src={src}
        alt=""
        width={w}
        height={h}
        loading="lazy"
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setSrcIdx(i => i + 1)}
        style={{
          width: w,
          height: h,
          objectFit: "cover",
          borderRadius: rx,
          flexShrink: 0,
          boxShadow: "0 1px 3px rgba(0,0,0,0.55)",
          background: "#121722",
        }}
      />
    );
  }

  return genericLetterBadge(sym, w, h, fontFamily);
}
