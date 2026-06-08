/**
 * Minimal React shell for multichart iframe panels (B/C/D).
 * Loads only chart canvas + chart.js init — NOT the full TalariaV8bLive UI.
 * Parent MultichartGrid drives replay via panel-cmd-bridge / embed-bridge.
 */
import { useEffect } from "react";

function isMultichartEmbed() {
  try {
    return document.documentElement.classList.contains("multichart-embed")
      || new URLSearchParams(window.location.search).get("multichart") === "1";
  } catch (_) {
    return false;
  }
}

export default function MultichartEmbedShell() {
  useEffect(() => {
    if (!isMultichartEmbed()) return undefined;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 350; // ~35s — matches embed-bridge boot timeout

    const tryInit = async () => {
      if (cancelled) return;
      attempts += 1;

      if (typeof window.initializeChart !== "function") {
        if (attempts < maxAttempts) setTimeout(tryInit, 100);
        return;
      }

      if (window.chart) {
        try {
          window.dispatchEvent(new Event("resize"));
          if (window.chart.resize) {
            window.chart._lastResizeDpr = 0;
            window.chart.resize();
          }
          window.chart.render?.();
        } catch (_) {}
        return;
      }

      try {
        const instance = await window.initializeChart();
        if (cancelled || !instance) {
          if (attempts < maxAttempts) setTimeout(tryInit, 100);
          return;
        }
        const forceResize = () => {
          try {
            window.dispatchEvent(new Event("resize"));
            if (window.chart?.resize) {
              window.chart._lastResizeDpr = 0;
              window.chart.resize();
              window.chart.render?.();
            }
          } catch (_) {}
        };
        forceResize();
        requestAnimationFrame(forceResize);
        setTimeout(forceResize, 200);
      } catch (err) {
        console.error("[MultichartEmbedShell] chart init failed:", err);
        if (attempts < maxAttempts) setTimeout(tryInit, 100);
      }
    };

    tryInit();
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      data-v9-app="1"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#07080E",
      }}
    >
      <div
        id="chart-container"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
        }}
      >
        <div id="replayToolbar" aria-hidden="true" style={{ display: "none" }}>
          <div id="replayToolbarHandle" />
          <button type="button" id="replayModeBtn" tabIndex={-1} />
        </div>
        <div id="panels-container" style={{ display: "none" }} />
        <div id="chartWrapper" className="chart-wrapper" style={{ position: "absolute", inset: 0 }}>
          <canvas
            id="chartCanvas"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              display: "block",
              background: "transparent",
            }}
          />
          <svg id="drawingSvg" />
          <div
            id="priceAxisZone"
            className="axis-cursor-zone price-axis-zone"
            style={{
              position: "absolute",
              right: 0,
              top: 5,
              bottom: 30,
              width: 14,
              zIndex: 10,
              pointerEvents: "auto",
            }}
          />
          <div
            id="timeAxisZone"
            className="axis-cursor-zone time-axis-zone"
            style={{
              position: "absolute",
              left: 0,
              right: 60,
              bottom: 0,
              height: 10,
              zIndex: 10,
              pointerEvents: "auto",
            }}
          />
        </div>
      </div>
    </div>
  );
}
