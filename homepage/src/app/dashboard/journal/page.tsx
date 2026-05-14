"use client";

import React, { useState, useEffect, useRef } from "react";

export default function JournalPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) setError(true);
    }, 15000);
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      {loading && !error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#07080E",
            zIndex: 10,
            gap: 14,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "2.5px solid rgba(74,106,255,0.15)",
              borderTopColor: "#4A6AFF",
              animation: "spin 0.75s linear infinite",
            }}
          />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: "'Exo 2', sans-serif", margin: 0 }}>
            Loading Journal…
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#07080E",
            zIndex: 10,
            gap: 16,
          }}
        >
          <svg width={40} height={40} viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="rgba(255,80,104,0.5)" strokeWidth="1.5" />
            <path d="M12 8v4M12 16h.01" stroke="rgba(255,80,104,0.8)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", fontFamily: "'Exo 2', sans-serif", margin: 0, textAlign: "center" }}>
            Journal is taking too long to load.
          </p>
          <a
            href="/journal/dashboard"
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#4A6AFF",
              background: "rgba(74,106,255,0.08)",
              border: "1px solid rgba(74,106,255,0.22)",
              borderRadius: 8,
              padding: "8px 18px",
              textDecoration: "none",
              fontFamily: "'Exo 2', sans-serif",
            }}
          >
            Open Journal directly →
          </a>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src="/journal/dashboard"
        title="Trade Journal"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
        style={{
          flex: 1,
          width: "100%",
          border: "none",
          background: "#07080E",
          opacity: loading || error ? 0 : 1,
          transition: "opacity 0.2s",
        }}
        allow="same-origin"
      />
    </div>
  );
}
