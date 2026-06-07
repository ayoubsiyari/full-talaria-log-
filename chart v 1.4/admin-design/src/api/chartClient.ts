export function httpErrDetail(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const d = (payload as { detail?: unknown }).detail;
  if (d == null) return "";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((x) => {
        if (!x || typeof x !== "object") return String(x);
        const o = x as { msg?: string; message?: string };
        return o.msg || o.message || JSON.stringify(x);
      })
      .join("; ");
  }
  if (typeof d === "object") return JSON.stringify(d);
  return String(d);
}

export async function chartApi<T = unknown>(
  url: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, { ...opts, credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(httpErrDetail(err) || `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function chartApiUpload<T = unknown>(
  url: string,
  formData: FormData,
  onProgress?: (pct: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.onload = () => {
      try {
        const data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
        else reject(new Error(httpErrDetail(data) || `Error ${xhr.status}`));
      } catch (e) {
        reject(e);
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
      };
    }
    xhr.send(formData);
  });
}
