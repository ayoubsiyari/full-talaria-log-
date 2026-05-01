// @ts-nocheck
"use client";
import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, ImageIcon, Upload } from 'lucide-react';

/** Max pasted data-URL length (chars) to keep JSON payloads and UI responsive. */
const MAX_DATA_URL_CHARS = 12 * 1024 * 1024;

const MAX_UPLOAD_FILE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_EDGE_PX = 1920;

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this image.'));
    };
    img.src = url;
  });
}

export async function compressImageFileToDataUrl(file: File) {
  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    throw new Error(`File too large (max ${Math.round(MAX_UPLOAD_FILE_BYTES / 1024 / 1024)}MB before compression).`);
  }
  if (!/^image\/(jpeg|png)$/i.test(file.type)) {
    throw new Error('Use a JPG or PNG file.');
  }

  const img = await loadImageFromFile(file);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (!w || !h) throw new Error('Invalid image dimensions.');

  const maxDim = MAX_IMAGE_EDGE_PX;
  if (w > maxDim || h > maxDim) {
    const s = maxDim / Math.max(w, h);
    w = Math.round(w * s);
    h = Math.round(h * s);
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process image in this browser.');

  const qualities = [0.85, 0.72, 0.58, 0.45, 0.32, 0.22];

  function tryEncode(cw: number, ch: number) {
    canvas.width = cw;
    canvas.height = ch;
    ctx.drawImage(img, 0, 0, cw, ch);
    for (let i = 0; i < qualities.length; i++) {
      const dataUrl = canvas.toDataURL('image/jpeg', qualities[i]);
      if (dataUrl.length <= MAX_DATA_URL_CHARS) return dataUrl;
    }
    return null;
  }

  let cw = w;
  let ch = h;
  for (let attempt = 0; attempt < 14; attempt++) {
    const out = tryEncode(cw, ch);
    if (out) return out;
    cw = Math.max(320, Math.round(cw * 0.82));
    ch = Math.max(240, Math.round(ch * 0.82));
  }
  throw new Error('Image is still too large after compression. Try a smaller or simpler image.');
}

/**
 * Returns a usable reference string: https? URL, or data:image/...;base64,... (e.g. chart export).
 */
export function normalizeReferenceUrl(raw) {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t) return null;
  if (/^data:image\/[^;]+;base64,/i.test(t)) {
    if (t.length > MAX_DATA_URL_CHARS) return null;
    return t;
  }
  try {
    const href = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

export default function ConditionReferenceUrlBlock({ value, onChange, compact, readOnly }) {
  const safe = normalizeReferenceUrl(value);
  const [imgFailed, setImgFailed] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImgFailed(false);
  }, [value]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setUploadBusy(true);
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      onChange(dataUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadBusy(false);
    }
  }

  if (readOnly) {
    if (!String(value || '').trim()) return null;
    return (
      <div className={compact ? 'mt-2' : 'mt-2'}>
        <div className="mb-1 flex items-center gap-1.5">
          <ImageIcon size={12} className="shrink-0 text-[var(--sl-text-muted)]" aria-hidden />
          <span className="font-mono-label text-[9px] font-bold uppercase text-[var(--sl-text-muted)]">
            Reference
          </span>
        </div>
        {safe ? (
          <div className="overflow-hidden rounded-md border border-[var(--sl-border)] bg-[var(--sl-bg)]">
            {!imgFailed ? (
              <img
                src={safe}
                alt=""
                className="max-h-36 w-full object-contain object-top"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="px-2 py-1.5 text-[10px] text-[var(--sl-text-sec)]">
                <a
                  href={safe}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-[var(--sl-accent)] hover:underline"
                >
                  <ExternalLink size={11} />
                  Open link
                </a>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--sl-text-muted)]">Invalid URL</p>
        )}
      </div>
    );
  }

  return (
    <div className={compact ? 'mt-2' : 'mt-3 border-t border-[var(--sl-border)] pt-3'}>
      <div className="mb-1 flex items-center gap-1.5">
        <ImageIcon size={14} className="shrink-0 text-[var(--sl-text-muted)]" aria-hidden />
        <span className="font-mono-label text-[10px] font-bold uppercase text-[var(--sl-text-muted)]">
          Screenshot / link
        </span>
        <span className="text-[10px] text-[var(--sl-text-faint)]">optional</span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        className="hidden"
        disabled={uploadBusy}
        onChange={handleFileChange}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… or paste data:image/… from chart"
          className="min-w-0 flex-1 rounded-md border border-[var(--sl-border)] bg-[var(--sl-card)] px-2 py-1.5 text-[11px] text-[var(--sl-text)] placeholder:text-[var(--sl-text-faint)] focus:outline-none focus:ring-1 focus:ring-[var(--sl-accent)]"
        />
        <button
          type="button"
          disabled={uploadBusy}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--sl-border)] bg-[var(--sl-input)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--sl-text)] hover:bg-[var(--sl-card)] disabled:opacity-50"
        >
          <Upload size={14} aria-hidden />
          {uploadBusy ? 'Compressing…' : 'Upload JPG/PNG'}
        </button>
      </div>
      {uploadError ? (
        <p className="mt-1 text-[10px] text-[var(--sl-orange)]">{uploadError}</p>
      ) : null}
      <p className="mt-1 text-[10px] text-[var(--sl-text-faint)]">
        Uploads are resized and saved as compressed JPEG (max ~12MB stored).
      </p>
      {safe ? (
        <div className="mt-2 overflow-hidden rounded-md border border-[var(--sl-border)] bg-[var(--sl-bg)]">
          {!imgFailed ? (
            <img
              src={safe}
              alt=""
              className="max-h-48 w-full object-contain object-top"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] text-[var(--sl-text-sec)]">
              <span>Preview not available for this URL.</span>
              <a
                href={safe}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[var(--sl-accent)] hover:underline"
              >
                <ExternalLink size={12} />
                Open link
              </a>
            </div>
          )}
          {!imgFailed ? (
            <div className="flex justify-end border-t border-[var(--sl-border)] bg-[var(--sl-input)]/50 px-2 py-1">
              <a
                href={safe}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-[var(--sl-text-muted)] hover:text-[var(--sl-accent)]"
              >
                <ExternalLink size={12} />
                Open in new tab
              </a>
            </div>
          ) : null}
        </div>
      ) : value && String(value).trim() ? (
        <p className="mt-1 text-[10px] text-[var(--sl-orange)]">
          Enter a valid https URL, or a data:image/…;base64,… paste from the chart (max ~12MB), or use
          Upload.
        </p>
      ) : null}
    </div>
  );
}
