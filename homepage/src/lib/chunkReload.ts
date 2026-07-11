/**
 * Recovery for stale-deploy chunk failures.
 *
 * After a deploy the old hashed JS chunks are gone. A user whose HTML shell was
 * cached (or who kept a tab open across the deploy) then requests a chunk that
 * 404s — Next surfaces this as a `ChunkLoadError` and shows its generic
 * "client-side exception" crash page. Reloading fetches the fresh HTML shell
 * (served `no-cache` by nginx) which points at the new chunk names.
 *
 * A sessionStorage timestamp guards against reload loops when the chunk is
 * genuinely unrecoverable (e.g. a rollback), so we retry at most once per window.
 */

const RELOAD_GUARD_KEY = "talaria_chunk_reload_at";
const RELOAD_MIN_INTERVAL_MS = 30_000;

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { name?: string; message?: string };
  const name = String(err.name || "");
  const message = String(err.message || err || "");
  if (name === "ChunkLoadError") return true;
  return (
    /Loading chunk [^\s]+ failed/i.test(message) ||
    /Loading CSS chunk/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

/**
 * Reload once to pick up fresh chunks. Returns true if a reload was triggered.
 * Guarded so it never loops if the reload does not resolve the error.
 */
export function maybeReloadForChunkError(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isChunkLoadError(error)) return false;

  let last = 0;
  try {
    last = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) || "0");
  } catch {
    /* sessionStorage may be blocked */
  }

  if (Date.now() - last < RELOAD_MIN_INTERVAL_MS) return false;

  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }

  window.location.reload();
  return true;
}
