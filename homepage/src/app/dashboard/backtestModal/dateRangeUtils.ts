export type DateRangeFile = { id: string; ticker: string; from: string; to: string };

/** Intersection of [from, to] across files (latest start, earliest end). */
export function computeOverlapRange(files: DateRangeFile[]) {
  const withRange = files.filter(f => f.from && f.to);
  if (!withRange.length) {
    return { start: "", end: "", hasOverlap: false, conflict: false };
  }
  const start = withRange.map(f => f.from).sort().slice(-1)[0] || "";
  const end = withRange.map(f => f.to).sort()[0] || "";
  if (!start || !end || start > end) {
    return { start: "", end: "", hasOverlap: false, conflict: true };
  }
  return { start, end, hasOverlap: true, conflict: false };
}

export function isoToDisplay(iso: string, monthNames: string[]) {
  if (!iso) return "";
  const d = new Date(iso.split("T")[0] + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}-${monthNames[d.getMonth()]}-${d.getFullYear()}`;
}

export function clampIso(iso: string, minIso: string, maxIso: string) {
  if (!iso) return iso;
  if (minIso && iso < minIso) return minIso;
  if (maxIso && iso > maxIso) return maxIso;
  return iso;
}
