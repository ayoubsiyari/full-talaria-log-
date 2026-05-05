"use client";

import React, { useEffect, useMemo, useState } from "react";
import FlagSvg from "./FlagSvg";
import { currencyCountry } from "./FlagSvg";
import {
  METAL_BADGES,
  cryptoLogoCandidates,
  futuresBadgeColors,
  normalizeBadgeAsset,
  stockLogoCandidates,
} from "./symbolIcons";

function futuresRoot(sym: string): string {
  const u = String(sym || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cut = u.search(/\d/);
  return cut > 0 ? u.slice(0, cut) : u;
}

function genericLetterBadge(sym: string, w: number, h: number, fontFamily: string) {
  const label =
    String(sym || "")
      .replace(/USDT|USDC|USD$/i, "")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase() || "?";
  const rx = Math.round(h * 0.35);
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{
        display: "block",
        flexShrink: 0,
        borderRadius: rx,
        boxShadow: "0 1px 3px rgba(0,0,0,0.6)",
      }}
    >
      <rect width={w} height={h} rx={rx} fill="#22324A" />
      <text
        x={w / 2}
        y={h * 0.73}
        textAnchor="middle"
        fill="#D7E6FF"
        fontSize={h * 0.45}
        fontWeight="800"
        fontFamily={fontFamily}
      >
        {label}
      </text>
    </svg>
  );
}

function futuresSvg(sym: string, w: number, h: number, fontFamily: string) {
  const root = futuresRoot(sym).slice(0, 6);
  const { bg, fg } = futuresBadgeColors(root);
  const label = root.slice(0, 4);
  const rx = Math.round(h * 0.3);
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{
        display: "block",
        flexShrink: 0,
        borderRadius: rx,
        boxShadow: "0 1px 3px rgba(0,0,0,0.65)",
      }}
    >
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

export function SymbolBadge({
  sym,
  asset,
  w = 11,
  h = 10,
  fontFamily = "'Exo 2', sans-serif",
}: {
  sym: string;
  asset?: string;
  w?: number;
  h?: number;
  fontFamily?: string;
}) {
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
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{
          display: "block",
          flexShrink: 0,
          borderRadius: rx,
          boxShadow: "0 1px 3px rgba(0,0,0,0.6)",
        }}
      >
        <rect width={w} height={h} rx={rx} fill={metal.bg} />
        <text
          x={w / 2}
          y={h * 0.73}
          textAnchor="middle"
          fill={metal.fg}
          fontSize={h * 0.52}
          fontWeight="800"
          fontFamily={fontFamily}
        >
          {metal.label}
        </text>
      </svg>
    );
  }

  const isFxPair =
    upper.length === 6 &&
    !!currencyCountry[upper.slice(0, 3)] &&
    !!currencyCountry[upper.slice(3, 6)];

  if (isFxPair) {
    const fw = Math.round((w * 15) / 11);
    const fh = h;
    const b = upper.slice(0, 3);
    const q = upper.slice(3, 6);
    return (
      <div
        style={{
          position: "relative",
          width: Math.round((w * 22) / 11),
          height: fh,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            borderRadius: 2,
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.7)",
            zIndex: 2,
          }}
        >
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
    return futuresSvg(sym, w, h, fontFamily);
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
