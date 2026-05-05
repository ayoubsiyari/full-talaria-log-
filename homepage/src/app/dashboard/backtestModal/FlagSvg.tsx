"use client";

import React from "react";

const currencyCountry: Record<string, string> = {
  EUR: "EU", JPY: "JP", USD: "US", GBP: "GB", AUD: "AU", CAD: "CA", CHF: "CH", NZD: "NZ",
  SEK: "SE", NOK: "NO", DKK: "DK", SGD: "SG", HKD: "HK", MXN: "MX", ZAR: "ZA", TRY: "TR",
  PLN: "PL", CZK: "CZ", HUF: "HU",
};

type FlagSvgProps = { code: string; w?: number; h?: number };

export default function FlagSvg({ code, w = 22, h = 14 }: FlagSvgProps) {
  const sw = { width: w, height: h, viewBox: "0 0 22 14", style: { display: "block", flexShrink: 0 } as React.CSSProperties };
  const cc = currencyCountry[code] || code;
  const f: Record<string, React.ReactElement> = {
    EU: <svg {...sw}><rect width={22} height={14} fill="#003399" />{Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      return <circle key={i} cx={11 + 4.8 * Math.cos(a)} cy={7 + 4.8 * Math.sin(a)} r={0.85} fill="#FFCC00" />;
    })}</svg>,
    JP: <svg {...sw}><rect width={22} height={14} fill="#fff" /><circle cx={11} cy={7} r={4} fill="#BC002D" /></svg>,
    US: <svg {...sw}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => (
        <rect key={i} y={i * 14 / 13} width={22} height={14 / 13 + 0.2} fill={i % 2 === 0 ? "#B22234" : "#fff"} />
      ))}
      <rect width={9} height={7.5} fill="#3C3B6E" />
      {Array.from({ length: 18 }, (_, i) => {
        const col = i % 6, row = Math.floor(i / 6);
        return <circle key={i} cx={0.9 + col * 1.45 + (row % 2 === 0 ? 0 : 0.72)} cy={0.9 + row * 2.4} r={0.42} fill="#fff" />;
      })}
    </svg>,
    GB: <svg {...sw}>
      <rect width={22} height={14} fill="#012169" />
      <line x1={0} y1={0} x2={22} y2={14} stroke="#fff" strokeWidth={4} /><line x1={22} y1={0} x2={0} y2={14} stroke="#fff" strokeWidth={4} />
      <line x1={0} y1={0} x2={22} y2={14} stroke="#C8102E" strokeWidth={2} /><line x1={22} y1={0} x2={0} y2={14} stroke="#C8102E" strokeWidth={2} />
      <rect x={9.5} y={0} width={3} height={14} fill="#fff" /><rect x={0} y={5.5} width={22} height={3} fill="#fff" />
      <rect x={10} y={0} width={2} height={14} fill="#C8102E" /><rect x={0} y={6} width={22} height={2} fill="#C8102E" />
    </svg>,
    AU: <svg {...sw}>
      <rect width={22} height={14} fill="#00008B" />
      <line x1={0} y1={0} x2={9} y2={7} stroke="#fff" strokeWidth={2.5} /><line x1={9} y1={0} x2={0} y2={7} stroke="#fff" strokeWidth={2.5} />
      <line x1={0} y1={0} x2={9} y2={7} stroke="#C8102E" strokeWidth={1.2} /><line x1={9} y1={0} x2={0} y2={7} stroke="#C8102E" strokeWidth={1.2} />
      <rect x={3.8} y={0} width={1.4} height={7} fill="#fff" /><rect x={0} y={2.8} width={9} height={1.4} fill="#fff" />
      <rect x={4.1} y={0} width={0.8} height={7} fill="#C8102E" /><rect x={0} y={3.1} width={9} height={0.8} fill="#C8102E" />
      <circle cx={4.5} cy={10.5} r={1.6} fill="#fff" opacity={0.9} />
      <circle cx={15} cy={3.5} r={1.1} fill="#fff" /><circle cx={13} cy={8} r={0.9} fill="#fff" /><circle cx={18} cy={7.5} r={0.9} fill="#fff" /><circle cx={19} cy={4.5} r={0.8} fill="#fff" />
    </svg>,
    CA: <svg {...sw}>
      <rect width={22} height={14} fill="#fff" />
      <rect width={5.5} height={14} fill="#FF0000" /><rect x={16.5} width={5.5} height={14} fill="#FF0000" />
      <path d="M11,2 L12,5 L14.5,4.5 L13,6 L15,7 L11.5,8.5 L12,11 L11,10 L10,11 L10.5,8.5 L7,7 L9,6 L7.5,4.5 L10,5 Z" fill="#FF0000" />
    </svg>,
    CH: <svg {...sw}><rect width={22} height={14} fill="#FF0000" /><rect x={9.5} y={2.5} width={3} height={9} fill="#fff" /><rect x={5.5} y={5.5} width={11} height={3} fill="#fff" /></svg>,
    DE: <svg {...sw}><rect width={22} height={14} fill="#000" /><rect y={4.67} width={22} height={4.66} fill="#DD0000" /><rect y={9.33} width={22} height={4.67} fill="#FFCE00" /></svg>,
    FR: <svg {...sw}><rect width={22} height={14} fill="#002395" /><rect x={7.33} width={7.34} height={14} fill="#fff" /><rect x={14.67} width={7.33} height={14} fill="#ED2939" /></svg>,
    IT: <svg {...sw}><rect width={22} height={14} fill="#009246" /><rect x={7.33} width={7.34} height={14} fill="#fff" /><rect x={14.67} width={7.33} height={14} fill="#CE2B37" /></svg>,
    CN: <svg {...sw}><rect width={22} height={14} fill="#DE2910" /><polygon points="3.5,1.5 4.2,3.6 6.2,3.6 4.6,4.8 5.3,6.9 3.5,5.6 1.7,6.9 2.4,4.8 0.8,3.6 2.8,3.6" fill="#FFDE00" /></svg>,
    NZ: <svg {...sw}>
      <rect width={22} height={14} fill="#00247D" />
      <line x1={0} y1={0} x2={9} y2={7} stroke="#fff" strokeWidth={2.5} /><line x1={9} y1={0} x2={0} y2={7} stroke="#fff" strokeWidth={2.5} />
      <line x1={0} y1={0} x2={9} y2={7} stroke="#C8102E" strokeWidth={1.2} /><line x1={9} y1={0} x2={0} y2={7} stroke="#C8102E" strokeWidth={1.2} />
      <rect x={3.8} y={0} width={1.4} height={7} fill="#fff" /><rect x={0} y={2.8} width={9} height={1.4} fill="#fff" />
      <rect x={4.1} y={0} width={0.8} height={7} fill="#C8102E" /><rect x={0} y={3.1} width={9} height={0.8} fill="#C8102E" />
      <circle cx={14} cy={3} r={1.2} fill="#CC142B" stroke="#fff" strokeWidth={0.4} />
      <circle cx={18} cy={5.5} r={1} fill="#CC142B" stroke="#fff" strokeWidth={0.4} />
      <circle cx={17} cy={9.5} r={1} fill="#CC142B" stroke="#fff" strokeWidth={0.4} />
      <circle cx={13.5} cy={7.5} r={0.8} fill="#CC142B" stroke="#fff" strokeWidth={0.3} />
    </svg>,
    SE: <svg {...sw}><rect width={22} height={14} fill="#006AA7" /><rect x={6} y={0} width={3} height={14} fill="#FECC02" /><rect x={0} y={5.5} width={22} height={3} fill="#FECC02" /></svg>,
    NO: <svg {...sw}><rect width={22} height={14} fill="#EF2B2D" /><rect x={5.5} y={0} width={4} height={14} fill="#fff" /><rect x={0} y={5} width={22} height={4} fill="#fff" /><rect x={7} y={0} width={1.5} height={14} fill="#003680" /><rect x={0} y={6.25} width={22} height={1.5} fill="#003680" /></svg>,
    DK: <svg {...sw}><rect width={22} height={14} fill="#C60C30" /><rect x={6} y={0} width={3} height={14} fill="#fff" /><rect x={0} y={5.5} width={22} height={3} fill="#fff" /></svg>,
    SG: <svg {...sw}><rect width={22} height={14} fill="#EF3340" /><rect y={7} width={22} height={7} fill="#fff" /><circle cx={5.5} cy={7} r={2.5} fill="#fff" /><circle cx={7} cy={7} r={2.4} fill="#EF3340" /></svg>,
    HK: <svg {...sw}><rect width={22} height={14} fill="#DE2910" /></svg>,
    MX: <svg {...sw}><rect width={22} height={14} fill="#006847" /><rect x={7.33} width={7.34} height={14} fill="#fff" /><rect x={14.67} width={7.33} height={14} fill="#CE1126" /></svg>,
    ZA: <svg {...sw}><rect width={22} height={14} fill="#007A4D" /></svg>,
    TR: <svg {...sw}><rect width={22} height={14} fill="#E30A17" /></svg>,
    PL: <svg {...sw}><rect width={22} height={14} fill="#fff" /><rect y={7} width={22} height={7} fill="#DC143C" /></svg>,
    CZ: <svg {...sw}><rect width={22} height={14} fill="#D7141A" /><rect width={22} height={7} fill="#fff" /></svg>,
    HU: <svg {...sw}><rect width={22} height={14} fill="#CE2939" /><rect y={4.67} width={22} height={4.66} fill="#fff" /></svg>,
  };
  return f[cc] || (
    <svg {...sw}><rect width={22} height={14} fill="#1a2030" /><text x={11} y={10} textAnchor="middle" fontSize={6} fontWeight="bold" fill="#8CA0FF" fontFamily="sans-serif">{cc}</text></svg>
  );
}

export { currencyCountry };
