"use client";

import React from "react";

const F = "'Exo 2', sans-serif";

const SHIMMER_STYLE = `
  @keyframes tlrDashSkeletonShimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  @keyframes tlrLoadRotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

type V16DashboardLoadingProps = {
  label?: string;
  labelAr?: string;
  isArabic?: boolean;
  /** Cover the full dashboard embed area (default). */
  fullScreen?: boolean;
  /** skeleton = layout placeholders; spinner = legacy centered spinner only */
  variant?: "skeleton" | "spinner";
};

function SkeletonBlock({
  height,
  width = "100%",
  radius = 0,
  style,
}: {
  height: number | string;
  width?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className="tlr-dash-skeleton-block"
      style={{
        position: "relative",
        overflow: "hidden",
        height,
        width,
        borderRadius: radius,
        background: "rgba(255,255,255,0.045)",
        border: "1px solid rgba(140,160,255,0.08)",
        boxSizing: "border-box",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(140,160,255,0.10) 45%, rgba(0,212,161,0.08) 55%, transparent 100%)",
          animation: "tlrDashSkeletonShimmer 1.35s ease-in-out infinite",
        }}
      />
    </div>
  );
}

function SnapshotSkeletonBody({ gap = 12 }: { gap?: number }) {
  const kpiH = 136;
  const pulseH = 464;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1280,
        display: "flex",
        flexDirection: "column",
        gap: 22,
        padding: "8px 4px 24px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
            <SkeletonBlock height={24} width={148} radius={2} />
            <SkeletonBlock height={2} width={220} radius={0} />
          </div>
          <SkeletonBlock height={28} width={200} radius={0} />
        </div>
        <SkeletonBlock height={1} width="100%" radius={0} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(174px, 1fr))",
          gap,
          alignItems: "stretch",
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={`kpi-${i}`}
            style={{
              minHeight: kpiH,
              padding: 12,
              background: "rgba(12,16,29,0.72)",
              border: "1px solid rgba(140,160,255,0.10)",
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
              gap: 10,
              boxSizing: "border-box",
            }}
          >
            <SkeletonBlock height={10} width="42%" radius={0} />
            <SkeletonBlock height={28} width="68%" radius={0} />
            <SkeletonBlock height={10} width="54%" radius={0} />
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1.18fr) minmax(0, 3fr)",
          gap,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            minHeight: pulseH,
            padding: 14,
            background: "rgba(12,16,29,0.72)",
            border: "1px solid rgba(140,160,255,0.10)",
            display: "grid",
            gridTemplateRows: "auto 1fr",
            gap: 12,
            boxSizing: "border-box",
          }}
        >
          <SkeletonBlock height={12} width={88} radius={0} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, alignContent: "start" }}>
            {Array.from({ length: 35 }).map((_, i) => (
              <SkeletonBlock key={`cal-${i}`} height={34} radius={0} />
            ))}
          </div>
        </div>
        <div
          style={{
            minHeight: pulseH,
            padding: 14,
            background: "rgba(12,16,29,0.72)",
            border: "1px solid rgba(140,160,255,0.10)",
            display: "grid",
            gridTemplateRows: "auto 1fr",
            gap: 12,
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <SkeletonBlock height={12} width={108} radius={0} />
            <SkeletonBlock height={32} width={246} radius={0} />
          </div>
          <SkeletonBlock height="100%" radius={0} style={{ minHeight: 320 }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap, alignItems: "stretch" }}>
        <SkeletonBlock height={120} radius={0} />
        <SkeletonBlock height={120} radius={0} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(240px, 0.85fr)", gap, alignItems: "stretch" }}>
        <SkeletonBlock height={214} radius={0} />
        <SkeletonBlock height={214} radius={0} />
      </div>
    </div>
  );
}

/** Matches embedded TalariaV16 snapshot layout while API data loads. */
export default function V16DashboardLoading({
  label = "Loading dashboard",
  labelAr = "جاري تحميل لوحة التحكم",
  isArabic = false,
  fullScreen = true,
  variant = "skeleton",
}: V16DashboardLoadingProps) {
  const text = isArabic ? labelAr : label;

  if (variant === "spinner") {
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
        <style>{SHIMMER_STYLE}</style>
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      aria-busy="true"
      aria-label={text}
      style={{
        ...(fullScreen
          ? { position: "absolute", inset: 0, zIndex: 30, background: "#07080E" }
          : { position: "relative", minHeight: 200, background: "transparent" }),
        fontFamily: F,
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: fullScreen ? "28px 20px 32px" : "12px 0",
          boxSizing: "border-box",
        }}
      >
        <SnapshotSkeletonBody />
      </div>
      <style>{SHIMMER_STYLE}</style>
    </div>
  );
}

export { SnapshotSkeletonBody, SkeletonBlock, SHIMMER_STYLE };
