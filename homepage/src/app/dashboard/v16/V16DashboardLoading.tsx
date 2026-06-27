"use client";

import React from "react";

const F = "'Exo 2', sans-serif";

type V16DashboardLoadingProps = {
  label?: string;
  labelAr?: string;
  isArabic?: boolean;
  /** Cover the full dashboard embed area (default). */
  fullScreen?: boolean;
};

/** Matches the embedded TalariaV16 “Loading data” spinner (tlrLoadRotate). */
export default function V16DashboardLoading({
  label = "Loading data",
  labelAr = "جاري تحميل البيانات",
  isArabic = false,
  fullScreen = true,
}: V16DashboardLoadingProps) {
  const text = isArabic ? labelAr : label;

  return (
    <div
      aria-live="polite"
      aria-busy="true"
      style={{
        ...(fullScreen
          ? { position: "absolute", inset: 0, zIndex: 30, background: "#07080E" }
          : { position: "relative", minHeight: 200, background: "transparent" }),
        fontFamily: F,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: "2px solid rgba(140,160,255,0.20)",
          borderTopColor: "#4A6AFF",
          borderRightColor: "rgba(0,212,161,0.75)",
          boxShadow: "0 0 18px rgba(74,106,255,0.13)",
          animation: "tlrLoadRotate 0.82s linear infinite",
        }}
      />
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontFamily: F,
        }}
      >
        {text}
      </div>
      <style>{`
        @keyframes tlrLoadRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
