/**
 * Entry for the LIVE V9 build.
 *
 * Multichart iframe panels (?multichart=1) load a minimal chart-only shell so
 * B/C/D boot in seconds instead of parsing the full TalariaV8bLive bundle.
 */
import { createRoot } from "react-dom/client";

function isMultichartEmbedUrl() {
  try {
    return new URLSearchParams(window.location.search).get("multichart") === "1";
  } catch (_) {
    return false;
  }
}

const rootEl = document.getElementById("root");
if (rootEl) {
  if (isMultichartEmbedUrl()) {
    import("../src/MultichartEmbedShell.jsx").then(({ default: MultichartEmbedShell }) => {
      createRoot(rootEl).render(<MultichartEmbedShell />);
    });
  } else {
    import("../src/TalariaV8bLive.jsx").then(({ default: TalariaV8bLive }) => {
      createRoot(rootEl).render(<TalariaV8bLive />);
    });
  }
}
