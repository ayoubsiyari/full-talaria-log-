"use client";

import { useEffect } from "react";
import { maybeReloadForChunkError } from "@/lib/chunkReload";

/**
 * Global net for stale-deploy chunk failures on lazily-loaded routes.
 *
 * Any dynamic import (e.g. the dashboard's `TalariaV16` chunk) that 404s after a
 * deploy throws a `ChunkLoadError`. When it happens outside a React render (async
 * import rejection) it surfaces as an `unhandledrejection` / window `error`, which
 * React error boundaries never see. This catches those and reloads once to fetch
 * the fresh shell + chunks. Render-time chunk errors are handled by the nearest
 * error boundary instead.
 */
export default function ChunkReloadGuard() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      maybeReloadForChunkError(event.error || event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      maybeReloadForChunkError(event.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
