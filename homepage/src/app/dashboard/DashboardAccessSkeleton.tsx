"use client";

import React from "react";

const F = "'Exo 2', sans-serif";

export default function DashboardAccessSkeleton({ isArabic }: { isArabic: boolean }) {
  const label = isArabic ? "جارٍ التحقق من صلاحية الوصول…" : "Verifying your access…";

  return (
    <div
      style={{
        minHeight: "48vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: 40,
        fontFamily: F,
      }}
    >
      <div style={{ width: "min(320px, 88%)", display: "flex", flexDirection: "column", gap: 10 }}>
        {[0.92, 0.72, 0.55].map((w, i) => (
          <div
            key={i}
            className="db-access-shimmer"
            style={{
              height: 11,
              width: `${w * 100}%`,
              borderRadius: 6,
              background: "rgba(255,255,255,0.06)",
              overflow: "hidden",
              position: "relative",
            }}
          />
        ))}
      </div>
      <div
        style={{
          width: 32,
          height: 32,
          border: "2px solid rgba(74,106,255,0.2)",
          borderTopColor: "#4A6AFF",
          borderRadius: "50%",
          animation: "db-spin 0.75s linear infinite",
        }}
      />
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.42)", letterSpacing: "0.04em" }}>
        {label}
      </p>
      <style>{`
        @keyframes db-spin { to { transform: rotate(360deg); } }
        .db-access-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255,255,255,0.12) 50%,
            transparent 100%
          );
          background-size: 220% 100%;
          animation: db-access-shimmer-move 1.35s ease-in-out infinite;
        }
        @keyframes db-access-shimmer-move {
          0% { transform: translateX(-40%); }
          100% { transform: translateX(40%); }
        }
      `}</style>
    </div>
  );
}
