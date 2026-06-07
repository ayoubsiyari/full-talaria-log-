import { fetchAuthMe } from "./authMe";
import { httpErrDetail } from "./chartClient";

async function getJournalToken(): Promise<string | null> {
  try {
    const stored = localStorage.getItem("token");
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  try {
    const data = await fetchAuthMe();
    if (data.journal_token) {
      localStorage.setItem("token", data.journal_token);
      return data.journal_token;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function journalApi<T = unknown>(
  url: string,
  opts: RequestInit = {}
): Promise<T> {
  const token = await getJournalToken();
  const headers = new Headers(opts.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...opts, credentials: "include", headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(httpErrDetail(err) || `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}
